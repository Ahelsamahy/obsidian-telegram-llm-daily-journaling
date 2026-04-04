import { Notice, Plugin } from "obsidian";
import { DiagnosticLog } from "./diagnostic-log";
import { DEFAULT_SETTINGS, type JournalSettings } from "./settings/types";
import type { JournalPluginApi } from "./settings/types";
import { JournalSettingTab } from "./settings-tab";
import { TelegramJournalBot } from "./bot/telegram-bot";
import { fetchAsrModelsFromHuggingFace } from "./utils/huggingface-asr-models";

export default class TelegramLlmDailyJournalPlugin
	extends Plugin
	implements JournalPluginApi
{
	settings: JournalSettings;
	bot: TelegramJournalBot | null = null;
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

		if (this.settings.disable_auto_reception) {
			this.addRibbonIcon(
				"send",
				"Telegram daily journal: get updates",
				() => {
					void this.safeGetUpdates();
				}
			);
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: "tg-daily-get-updates",
			name: "Telegram daily journal: get updates",
			callback: () => {
				void this.safeGetUpdates();
			},
		});

		this.addCommand({
			id: "tg-daily-start",
			name: "Telegram daily journal: start bot",
			callback: () => {
				this.startBot();
			},
		});

		this.addCommand({
			id: "tg-daily-stop",
			name: "Telegram daily journal: stop bot",
			callback: () => {
				void this.stopBot();
			},
		});
	}

	onunload(): void {
		void this.stopBot();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<JournalSettings>
		);
	}

	async saveSettings(): Promise<void> {
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
			this.appendDiagnosticLog(
				`ASR model list refresh failed: ${detail}`
			);
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

	async initBot(): Promise<void> {
		try {
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

			await this.stopBot();
			this.bot = new TelegramJournalBot(this.app.vault, this.settings, {
				log: (m) => this.appendDiagnosticLog(m),
				onJournalSaved: async () => {
					this.settings.last_journal_saved_epoch_ms = Date.now();
					await this.saveSettings();
				},
				getLastProcessedUpdateId: () =>
					this.settings.last_processed_update_id,
				persistProcessedUpdateId: async (updateId) => {
					this.settings.last_processed_update_id = updateId;
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
			console.error("Telegram daily journal: failed to init bot", error);
			this.appendDiagnosticLog(
				`Init failed: ${error instanceof Error ? error.message : String(error)}`
			);
			new Notice("Failed to start Telegram bot (see console).");
			this.bot = null;
		}
	}

	startBot(): void {
		if (this.bot) {
			new Notice("Telegram bot starting");
			this.appendDiagnosticLog("Long-poll receiver started.");
			this.bot.start();
		}
	}

	async stopBot(): Promise<void> {
		try {
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
		if (!this.bot) {
			new Notice("Bot is not running.");
			this.appendDiagnosticLog("getUpdates: bot not initialized.");
			return;
		}
		this.appendDiagnosticLog("Manual getUpdates…");
		await this.bot.getUpdates();
		this.appendDiagnosticLog("Manual getUpdates finished.");
	}

	private async safeGetUpdates(): Promise<void> {
		try {
			await this.getUpdates();
		} catch (e) {
			console.error(e);
			new Notice("Failed to get updates (see console).");
		}
	}
}
