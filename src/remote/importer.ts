import { Mutex } from "async-mutex";
import { TFile, moment, requestUrl, type Vault } from "obsidian";
import type { Message } from "grammy/types";
import { DailyNoteWriter, buildMediaJournalBody, buildMessageReceiptMarker } from "../bot/daily-writer";
import { transcribeWithLocalAsr } from "../bot/asr";
import type { JournalSettings } from "../settings/types";
import { saveBinaryToVault } from "../utils/download";
import { ensureFolderExists } from "../utils/download";
import { buildVaultMediaPath } from "../utils/media-path";
import { messageToObsidianText } from "../utils/telegram-markdown";
import { prefixBodyWithReplyContext } from "../utils/reply-context";
import type {
	LocalImportJob,
	RemoteJournalEvent,
	RemoteJournalEventKind,
	TranscriptionJobState,
} from "./types";
import { RemoteReceiverClient } from "./client";

type LogFn = (message: string) => void;
type SaveSettingsFn = () => Promise<void>;
type GetSettingsFn = () => JournalSettings;

function isAudioKind(kind: RemoteJournalEventKind): boolean {
	return kind === "audio" || kind === "voice";
}

function parseMessage(event: RemoteJournalEvent): Message {
	return JSON.parse(event.messageJson) as Message;
}

export class RemoteReceiverImporter {
	private readonly mutex = new Mutex();
	private intervalId: number | null = null;

	constructor(
		private readonly vault: Vault,
		private readonly getSettings: GetSettingsFn,
		private readonly saveSettings: SaveSettingsFn,
		private readonly writer: DailyNoteWriter,
		private readonly log: LogFn = () => {},
		private readonly onJournalSaved?: () => void | Promise<void>
	) {}

	start(): void {
		this.stop();
		const settings = this.getSettings();
		if (settings.capture_mode !== "remote_receiver") {
			return;
		}
		if (settings.receiver_sync_on_startup) {
			void this.syncNow();
		}
		this.intervalId = window.setInterval(() => {
			void this.syncNow();
		}, Math.max(5, settings.receiver_sync_interval_sec) * 1000);
	}

	stop(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	async syncNow(): Promise<void> {
		const release = await this.mutex.acquire();
		try {
			const settings = this.getSettings();
			if (settings.capture_mode !== "remote_receiver") {
				return;
			}
			await this.resumePendingJobs();
			const client = new RemoteReceiverClient(settings, this.log);
			const page = await client.fetchEvents(
				settings.last_receiver_cursor,
				Math.max(1, settings.receiver_batch_size)
			);
			for (const event of page.events) {
				await this.processEvent(event, client);
			}
			settings.last_receiver_cursor = Math.max(
				settings.last_receiver_cursor,
				page.nextCursor
			);
			await this.saveSettings();
		} finally {
			release();
		}
	}

	async resumePendingJobs(): Promise<void> {
		const settings = this.getSettings();
		const client = new RemoteReceiverClient(settings, this.log);
		for (const job of [...settings.local_import_jobs]) {
			if (
				job.state === "acked" ||
				job.state === "transcript_pending" ||
				job.state === "failed" ||
				job.state === "transcript_failed"
			) {
				continue;
			}
			const page = await client.fetchEvents(job.cursor - 1, 1);
			const event = page.events.find((item) => item.eventId === job.eventId);
			if (!event) {
				continue;
			}
			await this.processEvent(event, client);
		}
		for (const job of [...settings.local_import_jobs]) {
			if (job.state === "transcript_pending") {
				const page = await client.fetchEvents(job.cursor - 1, 1);
				const event = page.events.find((item) => item.eventId === job.eventId);
				if (!event) {
					continue;
				}
				await this.processTranscript(job, event);
			}
		}
	}

	private async processEvent(
		event: RemoteJournalEvent,
		client: RemoteReceiverClient
	): Promise<void> {
		const message = parseMessage(event);
		const job = this.upsertJob(event, message);
		try {
			const { notePath, assetPath } = await this.ensureAssetsAndNote(
				job,
				event,
				message
			);
			job.notePath = notePath;
			job.vaultAssetPath = assetPath;
			await this.persistJob(job);

			await client.ackEvent(event.eventId);
			job.state = isAudioKind(event.kind) && event.asset
				? "transcript_pending"
				: "acked";
			await this.persistJob(job);

			if (job.cursor > this.getSettings().last_receiver_cursor) {
				this.getSettings().last_receiver_cursor = job.cursor;
				await this.saveSettings();
			}

			if (job.state === "transcript_pending") {
				await this.processTranscript(job, event);
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			job.state = "failed";
			job.lastError = detail;
			job.retryCount += 1;
			job.lastAttemptEpochMs = Date.now();
			await this.persistJob(job);
			await client.failEvent(event.eventId, detail).catch(() => undefined);
			this.log(
				`Remote import failed event=${event.eventId} message=${String(
					message.message_id
				)}: ${detail}`
			);
		}
	}

	private async ensureAssetsAndNote(
		job: LocalImportJob,
		event: RemoteJournalEvent,
		message: Message
	): Promise<{ notePath: string; assetPath: string }> {
		const target = await this.writer.getTargetPathsForMessage(message);
		let assetPath = job.vaultAssetPath;

		if (event.asset) {
			if (assetPath === "") {
				assetPath = buildVaultMediaPath({
					noteFile: target.file,
					mediaSubfolderName: this.getSettings().media_subfolder_name,
					messageDateUnix: message.date,
					chatId: message.chat.id,
					messageId: message.message_id,
					fileUniqueId: event.asset.fileUniqueId,
					extension: event.asset.extension,
				});
			}
			if (job.state === "fetched") {
				const client = new RemoteReceiverClient(this.getSettings(), this.log);
				const bytes = await client.downloadAsset(event.asset.assetId);
				const saved = await saveBinaryToVault(this.vault, assetPath, bytes);
				if (!saved.ok) {
					throw new Error(`Could not save remote asset: ${assetPath}`);
				}
				job.state = "asset_saved";
				job.vaultAssetPath = saved.path;
				await this.persistJob(job);
				assetPath = saved.path;
			}
		}

		if (job.state === "fetched" || job.state === "asset_saved") {
			const body = this.buildNoteBody(event, message, assetPath);
			const appended = await this.writer.appendBlock(body, message);
			job.state = "note_written";
			job.notePath = target.file.path;
			job.lastAttemptEpochMs = Date.now();
			if (appended) {
				await Promise.resolve(this.onJournalSaved?.());
			}
			await this.persistJob(job);
		}

		return { notePath: target.file.path, assetPath };
	}

	private async processTranscript(
		job: LocalImportJob,
		event: RemoteJournalEvent
	): Promise<void> {
		if (!event.asset || !isAudioKind(event.kind)) {
			job.state = "acked";
			job.transcriptionState = "";
			await this.persistJob(job);
			return;
		}
		const settings = this.getSettings();
		if (!settings.transcription_enabled) {
			job.state = "acked";
			job.transcriptionState = "";
			await this.persistJob(job);
			return;
		}
		try {
			const message = parseMessage(event);
			const assetFile = this.vault.getAbstractFileByPath(job.vaultAssetPath);
			if (!(assetFile instanceof TFile)) {
				throw new Error(`Audio asset missing from vault: ${job.vaultAssetPath}`);
			}
			const bytes = await this.vault.readBinary(assetFile);
			const transcript = await transcribeWithLocalAsr(
				settings,
				bytes,
				event.asset.filename
			);
			await this.writer.patchTranscriptForMessage(message, transcript);
			job.state = "acked";
			job.transcriptionState = "completed";
			job.lastError = "";
			job.lastAttemptEpochMs = Date.now();
			await this.persistJob(job);
		} catch (error) {
			job.state = "transcript_failed";
			job.transcriptionState = "failed";
			job.lastError =
				error instanceof Error ? error.message : String(error);
			job.retryCount += 1;
			job.lastAttemptEpochMs = Date.now();
			await this.persistJob(job);
		}
	}

	private buildNoteBody(
		event: RemoteJournalEvent,
		message: Message,
		assetPath: string
	): string {
		const settings = this.getSettings();
		const text = messageToObsidianText(message, settings).trim();
		let body = event.asset ? buildMediaJournalBody(assetPath, text) : text;
		body = prefixBodyWithReplyContext(body, message, settings);
		return body;
	}

	private upsertJob(
		event: RemoteJournalEvent,
		message: Message
	): LocalImportJob {
		const settings = this.getSettings();
		const existing = settings.local_import_jobs.find(
			(job) => job.eventId === event.eventId
		);
		if (existing) {
			return existing;
		}
		const job: LocalImportJob = {
			eventId: event.eventId,
			cursor: event.cursor,
			state: "fetched",
			retryCount: 0,
			lastError: "",
			messageDateUnix: event.messageDateUnix,
			chatId: event.chatId,
			messageId: event.messageId,
			notePath: "",
			receiptMarker: buildMessageReceiptMarker(message),
			vaultAssetPath: "",
			transcriptionState: "",
			lastAttemptEpochMs: 0,
		};
		settings.local_import_jobs.push(job);
		return job;
	}

	private async persistJob(job: LocalImportJob): Promise<void> {
		job.lastAttemptEpochMs = Date.now();
		await this.saveSettings();
	}

	async retryFailedJobs(eventId?: string): Promise<void> {
		const settings = this.getSettings();
		for (const job of settings.local_import_jobs) {
			if (eventId && job.eventId !== eventId) {
				continue;
			}
			if (
				job.state !== "failed" &&
				job.state !== "transcript_failed"
			) {
				continue;
			}
			job.state = job.transcriptionState === "failed" ? "transcript_pending" : "fetched";
			job.lastError = "";
		}
		await this.saveSettings();
		await this.syncNow();
	}

	async healthCheck(): Promise<string[]> {
		const issues: string[] = [];
		const settings = this.getSettings();
		const client = new RemoteReceiverClient(settings, this.log);
		const receiver = await client.healthCheck();
		if (!receiver.ok) {
			issues.push(`Receiver: ${receiver.detail}`);
		}
		try {
			const msg = {
				message_id: 0,
				date: moment().unix(),
				chat: { id: 0, type: "private" },
			} as Message;
			const target = await this.writer.getTargetPathsForMessage(msg);
			if (!target.file.path) {
				issues.push("Daily notes: could not resolve the target note path.");
			}
			await ensureFolderExists(this.vault, target.mediaDir);
		} catch (error) {
			issues.push(
				`Daily notes: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		if (settings.transcription_enabled) {
			if (settings.asr_base_url.trim() === "") {
				issues.push("ASR: transcription is enabled but the base URL is empty.");
			} else {
				try {
					const base = settings.asr_base_url.replace(/\/$/, "");
					const res = await requestUrl({
						url: `${base}/models`,
						method: "GET",
						throw: false,
					});
					if (res.status < 200 || res.status >= 300) {
						issues.push(`ASR: /models returned HTTP ${String(res.status)}.`);
					}
				} catch (error) {
					issues.push(
						`ASR: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			}
		}
		if (
			settings.local_import_jobs.some(
				(job) =>
					job.state === "failed" || job.state === "transcript_failed"
			)
		) {
			issues.push("Import queue: there are failed items pending retry.");
		}
		return issues;
	}
}
