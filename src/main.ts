import { Notice, Plugin } from "obsidian";
import { DailyNoteWriter } from "./bot/daily-writer";
import { TelegramJournalBot } from "./bot/telegram-bot";
import { DiagnosticLog } from "./diagnostic-log";
import { RemoteReceiverImporter } from "./remote/importer";
import { fetchAsrModelsFromHuggingFace } from "./utils/huggingface-asr-models";
import { FailedItemsModal } from "./ui/failed-items-modal";
import { JournalSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type JournalPluginApi, type JournalSettings } from "./settings/types";
import {
	isValidDailyCutoff,
	isValidMediaSubfolderName,
	isValidReceiverBaseUrl,
	normalizeAllowedUsersInput,
	normalizeDailyCutoff,
	normalizeDownloadDir,
} from "./settings/validation";
import type { LocalImportJob } from "./remote/types";

export default class TelegramLlmDailyJournalPlugin
	extends Plugin
	implements JournalPluginApi
{
	settings: JournalSettings;
	bot: TelegramJournalBot | null = null;
	private remoteImporter: RemoteReceiverImporter | null = null;
	private readonly diagnosticLog = new DiagnosticLog();

	onload(): void {
		this.appendDiagnosticLog("Plugin loaded.");
		void this.bootstrap();
	}

	private async bootstrap(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new JournalSettingTab(this.app, this));
		this.registerCommands();
		await this.initBot();
		this.configureRibbon();
	}

	private configureRibbon(): void {
		this.addRibbonIcon(
			"send",
			this.settings.capture_mode === "remote_receiver"
				? "Telegram daily journal: sync remote receiver"
				: "Telegram daily journal: get updates",
			() => {
				void this.getUpdates();
			}
		);
	}

	private registerCommands(): void {
		this.addCommand({
			id: "tg-daily-get-updates",
			name:
				this.settings?.capture_mode === "remote_receiver"
					? "Telegram daily journal: sync remote receiver"
					: "Telegram daily journal: get updates",
			callback: () => {
				void this.getUpdates();
			},
		});

		this.addCommand({
			id: "tg-daily-start",
			name: "Telegram daily journal: start current capture mode",
			callback: () => {
				this.startBot();
			},
		});

		this.addCommand({
			id: "tg-daily-stop",
			name: "Telegram daily journal: stop current capture mode",
			callback: () => {
				void this.stopBot();
			},
		});

		this.addCommand({
			id: "tg-daily-health-check",
			name: "Telegram daily journal: health check",
			callback: () => {
				void this.showHealthCheck();
			},
		});

		this.addCommand({
			id: "tg-daily-failed-items",
			name: "Telegram daily journal: failed items",
			callback: () => {
				new FailedItemsModal(this.app, this).open();
			},
		});
	}

	onunload(): void {
		void this.stopBot();
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as Partial<JournalSettings> | null;
		const merged = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
		const lastCommitted =
			typeof raw?.last_committed_update_id === "number"
				? raw.last_committed_update_id
				: typeof raw?.last_processed_update_id === "number"
					? raw.last_processed_update_id
					: 0;
		this.settings = {
			...merged,
			allow_users: normalizeAllowedUsersInput(merged.allow_users),
			daily_note_time_cutoff: normalizeDailyCutoff(
				merged.daily_note_time_cutoff
			),
			download_dir: normalizeDownloadDir(merged.download_dir),
			media_subfolder_name: isValidMediaSubfolderName(
				merged.media_subfolder_name
			)
				? merged.media_subfolder_name.trim()
				: DEFAULT_SETTINGS.media_subfolder_name,
			last_processed_update_id: lastCommitted,
			last_seen_update_id: Math.max(
				merged.last_seen_update_id ?? 0,
				lastCommitted
			),
			last_committed_update_id: lastCommitted,
			receiver_base_url: merged.receiver_base_url.trim(),
			receiver_api_token: merged.receiver_api_token.trim(),
			receiver_sync_interval_sec: Math.max(
				5,
				Math.round(merged.receiver_sync_interval_sec)
			),
			receiver_batch_size: Math.max(1, Math.round(merged.receiver_batch_size)),
			receiver_health_timeout_ms: Math.max(
				1000,
				Math.round(merged.receiver_health_timeout_ms)
			),
			local_import_jobs: Array.isArray(merged.local_import_jobs)
				? merged.local_import_jobs
				: [],
		};
	}

	async saveSettings(): Promise<void> {
		this.settings.allow_users = normalizeAllowedUsersInput(
			this.settings.allow_users
		);
		this.settings.daily_note_time_cutoff = normalizeDailyCutoff(
			this.settings.daily_note_time_cutoff
		);
		this.settings.download_dir = normalizeDownloadDir(
			this.settings.download_dir
		);
		if (!isValidMediaSubfolderName(this.settings.media_subfolder_name)) {
			this.settings.media_subfolder_name =
				DEFAULT_SETTINGS.media_subfolder_name;
		}
		await this.saveData(this.settings);
	}

	appendDiagnosticLog(message: string): void {
		this.diagnosticLog.append(message);
	}

	getDiagnosticLogText(): string {
		return this.diagnosticLog.getText();
	}

	clearDiagnosticLog(): void {
		this.diagnosticLog.clear();
	}

	async refreshAsrModelsFromHuggingFace(): Promise<{
		ok: boolean;
		count: number;
		error?: string;
	}> {
		const { ids, error } = await fetchAsrModelsFromHuggingFace(
			this.settings.hf_token
		);
		if (ids.length === 0) {
			const detail = error ?? "Unknown error";
			this.appendDiagnosticLog(`ASR model list refresh failed: ${detail}`);
			return { ok: false, count: 0, error: detail };
		}
		this.settings.asr_hf_model_ids_cache = ids;
		this.settings.asr_hf_models_cache_epoch_ms = Date.now();
		await this.saveSettings();
		this.appendDiagnosticLog(
			`ASR model list refreshed from Hugging Face (${ids.length} models).`
		);
		return { ok: true, count: ids.length };
	}

	private createWriter(): DailyNoteWriter {
		return new DailyNoteWriter(this.app.vault, this.settings, async () => {
			this.settings.last_journal_saved_epoch_ms = Date.now();
			await this.saveSettings();
		});
	}

	async initBot(): Promise<void> {
		try {
			await this.stopBot();
			if (this.settings.capture_mode === "remote_receiver") {
				if (!this.settings.receiver_base_url || !this.settings.receiver_api_token) {
					new Notice(
						"Remote receiver mode needs a receiver URL and API token."
					);
					this.appendDiagnosticLog(
						"Remote init skipped: missing receiver URL or API token."
					);
					return;
				}
				this.remoteImporter = new RemoteReceiverImporter(
					this.app.vault,
					() => this.settings,
					() => this.saveSettings(),
					this.createWriter(),
					(m) => this.appendDiagnosticLog(m),
					async () => {
						this.settings.last_journal_saved_epoch_ms = Date.now();
						await this.saveSettings();
					}
				);
				this.remoteImporter.start();
				this.appendDiagnosticLog("Remote receiver sync started.");
				return;
			}

			if (!this.settings.token) {
				new Notice("Telegram bot token is not set.");
				this.appendDiagnosticLog("Init skipped: no bot token.");
				return;
			}
			if (this.settings.allow_users.length === 0) {
				new Notice("Add at least one allowed user in settings.");
				this.appendDiagnosticLog("Init skipped: no allowed users.");
				return;
			}

			this.bot = new TelegramJournalBot(this.app.vault, this.settings, {
				log: (m) => this.appendDiagnosticLog(m),
				onJournalSaved: async () => {
					this.settings.last_journal_saved_epoch_ms = Date.now();
					await this.saveSettings();
				},
				getLastCommittedUpdateId: () =>
					this.settings.last_committed_update_id,
				persistCommittedUpdateId: async (updateId) => {
					this.settings.last_committed_update_id = updateId;
					this.settings.last_processed_update_id = updateId;
					await this.saveSettings();
				},
				persistSeenUpdateId: async (updateId) => {
					this.settings.last_seen_update_id = Math.max(
						this.settings.last_seen_update_id,
						updateId
					);
					await this.saveSettings();
				},
			});

			if (!this.settings.disable_auto_reception) {
				this.startBot();
			} else {
				this.appendDiagnosticLog(
					"Auto reception disabled — use ribbon or command to fetch updates."
				);
			}
		} catch (error) {
			console.error("Telegram daily journal: failed to init", error);
			this.appendDiagnosticLog(
				`Init failed: ${error instanceof Error ? error.message : String(error)}`
			);
			new Notice("Failed to start Telegram journaling (see console).");
			this.bot = null;
			this.remoteImporter = null;
		}
	}

	startBot(): void {
		if (this.settings.capture_mode === "remote_receiver") {
			if (!this.remoteImporter) {
				void this.initBot();
				return;
			}
			void this.syncRemoteNow();
			return;
		}
		if (!this.bot) {
			void this.initBot();
			return;
		}
		new Notice("Telegram bot starting");
		this.appendDiagnosticLog("Long-poll receiver started.");
		this.bot.start();
	}

	async stopBot(): Promise<void> {
		try {
			this.remoteImporter?.stop();
			this.remoteImporter = null;
			if (this.bot) {
				await this.bot.bot.stop();
			}
		} catch (error) {
			console.error("Error stopping Telegram bot:", error);
		} finally {
			this.bot = null;
		}
	}

	async getUpdates(): Promise<void> {
		if (this.settings.capture_mode === "remote_receiver") {
			await this.syncRemoteNow();
			return;
		}
		if (!this.bot) {
			new Notice("Bot is not running.");
			this.appendDiagnosticLog("getUpdates: bot not initialized.");
			return;
		}
		this.appendDiagnosticLog("Manual getUpdates…");
		await this.bot.getUpdates();
		this.appendDiagnosticLog("Manual getUpdates finished.");
	}

	async syncRemoteNow(): Promise<void> {
		if (this.settings.capture_mode !== "remote_receiver") {
			new Notice("Capture mode is not set to remote receiver.");
			return;
		}
		if (!this.remoteImporter) {
			await this.initBot();
		}
		if (!this.remoteImporter) {
			return;
		}
		this.appendDiagnosticLog("Remote sync started.");
		await this.remoteImporter.syncNow();
		this.appendDiagnosticLog("Remote sync finished.");
	}

	async runHealthCheck(): Promise<string[]> {
		const issues: string[] = [];
		if (!isValidDailyCutoff(this.settings.daily_note_time_cutoff)) {
			issues.push("Daily note cutoff must use HH:MM (24h).");
		}
		if (!isValidMediaSubfolderName(this.settings.media_subfolder_name)) {
			issues.push("Media subfolder name is invalid.");
		}
		if (
			this.settings.capture_mode === "remote_receiver" &&
			!isValidReceiverBaseUrl(this.settings.receiver_base_url)
		) {
			issues.push("Receiver URL must start with http:// or https://.");
		}
		if (
			this.settings.capture_mode === "remote_receiver" &&
			this.settings.receiver_api_token.trim() === ""
		) {
			issues.push("Receiver API token is missing.");
		}
		if (this.settings.capture_mode === "remote_receiver") {
			if (!this.remoteImporter) {
				this.remoteImporter = new RemoteReceiverImporter(
					this.app.vault,
					() => this.settings,
					() => this.saveSettings(),
					this.createWriter(),
					(m) => this.appendDiagnosticLog(m),
					async () => {
						this.settings.last_journal_saved_epoch_ms = Date.now();
						await this.saveSettings();
					}
				);
			}
			issues.push(...(await this.remoteImporter.healthCheck()));
		} else {
			if (!this.settings.token.trim()) {
				issues.push("Embedded bot token is missing.");
			}
			if (this.settings.allow_users.length === 0) {
				issues.push("Allowed users list is empty.");
			}
		}
		return issues;
	}

	getFailedImportJobs(): LocalImportJob[] {
		return this.settings.local_import_jobs.filter(
			(job) => job.state === "failed" || job.state === "transcript_failed"
		);
	}

	async retryFailedJobs(eventId?: string): Promise<void> {
		if (this.settings.capture_mode !== "remote_receiver") {
			new Notice("Failed-item retries are only available in remote mode.");
			return;
		}
		if (!this.remoteImporter) {
			await this.initBot();
		}
		await this.remoteImporter?.retryFailedJobs(eventId);
	}

	private async showHealthCheck(): Promise<void> {
		const issues = await this.runHealthCheck();
		if (issues.length === 0) {
			new Notice("Telegram daily journal health check passed.");
			return;
		}
		new Notice(`Health check found ${String(issues.length)} issue(s).`);
		this.appendDiagnosticLog(`Health check: ${issues.join(" | ")}`);
	}
}
