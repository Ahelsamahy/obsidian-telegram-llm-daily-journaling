import { normalizePath, requestUrl } from "obsidian";
import type { Bot, Context } from "grammy";
import type { File, Message } from "grammy/types";
import type { JournalSettings } from "../settings/types";
import type { DailyNoteWriter } from "./daily-writer";
import { transcribeWithLocalAsr } from "./asr";
import { downloadAndSaveFile } from "../utils/download";
import { messageToObsidianText } from "../utils/telegram-markdown";
import { generateMediaFilename } from "./media-filename";
import { prefixBodyWithReplyContext } from "../utils/reply-context";
import { isMediaDownloadAllowedByNetworkPolicy } from "../utils/network";
import type { HandlerLog } from "./middleware";

export type { HandlerLog } from "./middleware";

/** Telegram Bot API limit for downloads via getFile (20 MB). */
export const TELEGRAM_BOT_MAX_FILE_BYTES = 20 * 1024 * 1024;

async function executePostAction(
	ctx: Context,
	settings: JournalSettings,
	log: HandlerLog
): Promise<void> {
	if (settings.action_after_reception === "delete") {
		try {
			await ctx.deleteMessage();
			return;
		} catch (err) {
			console.warn("Failed to delete message, falling back to reaction:", err);
		}
	}

	if (settings.action_after_reception === "reaction") {
		try {
			await ctx.react(settings.reaction_emoji as never);
		} catch (err) {
			log(
				`Post-action: reaction failed: ${err instanceof Error ? err.message : String(err)}`
			);
			console.error("Failed to set reaction:", err);
		}
	}
}

function handleVaultError(
	ctx: Context,
	err: unknown,
	context: string,
	log: HandlerLog
): never {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(`Failed to ${context}: ${msg}`, err);
	log(`Error (${context}): ${msg}`);
	void ctx.reply(`Failed to ${context}. ${msg}`);
	throw err instanceof Error ? err : new Error(msg);
}

export function assertFileSizeForBotDownload(
	file: File,
	ctx: Context,
	log: HandlerLog
): boolean {
	const sz = file.file_size;
	if (sz != null && sz > TELEGRAM_BOT_MAX_FILE_BYTES) {
		const mb = (sz / (1024 * 1024)).toFixed(1);
		log(
			`File too large for bot download: ${mb} MB (Telegram limit 20 MB). file_id=${String(file.file_id)}`
		);
		void ctx.reply(
			`This file is about ${mb} MB. Telegram only lets bots download files up to 20 MB. Send something smaller or compress it.`
		);
		return false;
	}
	return true;
}

/** Audio sent as a file attachment (not voice / music player). */
export function isAudioLikeDocument(msg: Message): boolean {
	const d = msg.document;
	if (!d) {
		return false;
	}
	const mime = d.mime_type ?? "";
	if (mime.startsWith("audio/")) {
		return true;
	}
	const name = d.file_name?.toLowerCase() ?? "";
	return /\.(mp3|m4a|ogg|opus|wav|flac|aac|webm|wma)$/i.test(name);
}

async function downloadTelegramFile(
	token: string,
	filePath: string
): Promise<ArrayBuffer> {
	const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
	const res = await requestUrl({
		url,
		method: "GET",
		throw: false,
	});
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`Telegram file download failed: ${String(res.status)}`);
	}
	return res.arrayBuffer;
}

export function pickAudioFilename(filePath: string): string {
	const base = filePath.split("/").pop() ?? "audio.bin";
	return base.includes(".") ? base : `${base}.ogg`;
}

async function downloadAndAppendMedia(
	ctx: Context,
	msg: Message,
	settings: JournalSettings,
	writer: DailyNoteWriter,
	token: string,
	log: HandlerLog
): Promise<void> {
	if (!isMediaDownloadAllowedByNetworkPolicy(settings)) {
		log(
			"Download media skipped: Wi‑Fi only setting and network looks cellular."
		);
		void ctx.reply(
			"Media download is set to Wi‑Fi only, and this connection looks like cellular. Try again on Wi‑Fi or turn off that option in the plugin settings."
		);
		return;
	}

	log(`Download media: getFile… message_id=${String(msg.message_id)}`);
	const file = await ctx.getFile();
	if (!file.file_path) {
		log("Download media: no file_path from Telegram.");
		void ctx.reply("Could not resolve media file path.");
		return;
	}

	if (!assertFileSizeForBotDownload(file, ctx, log)) {
		return;
	}

	const filename = generateMediaFilename(msg, file);
	const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
	const vaultPath = normalizePath(
		`${settings.download_dir}/${filename}`
	).replace(/^\/+/, "");

	const ok = await downloadAndSaveFile(writer.getVault(), url, vaultPath);
	if (!ok) {
		log(`Download media failed (vault write or network): ${vaultPath}`);
		void ctx.reply(
			`Could not save the file to the vault (${filename}). Check the diagnostics log or console.`
		);
		return;
	}

	const caption = messageToObsidianText(msg, settings).trim();
	const embedPath = vaultPath.replace(/^\/+/, "");
	let body = caption
		? `![[${embedPath}]]\n\n${caption}`
		: `![[${embedPath}]]`;
	body = prefixBodyWithReplyContext(body, msg, settings);
	log(
		`Download media OK: ${embedPath}${caption ? `, caption ${String(caption.length)} chars` : ""}`
	);
	await writer.appendBlock(body, msg);
	await executePostAction(ctx, settings, log);
}

const HELP_TEXT = `Telegram → Obsidian daily journal

• Text is appended to your daily note (formatting options in Obsidian plugin settings).
• Voice/audio: transcribed if ASR is on, or saved as a file if download media is on.
• Photos, videos, stickers, documents: saved under the media folder when download is on.

Commands:
/start — short intro
/help — this message
/last — last time a line was written to the vault (clock is the device running Obsidian)`;

export function setupCommands(
	bot: Bot,
	settings: JournalSettings,
	_writer: DailyNoteWriter
): void {
	bot.command("start", (ctx) => {
		void ctx.reply(
			"Send text to append to your daily note. Use /help for options. Voice: transcribe (ASR) or save files (download media) per settings."
		);
	});

	bot.command("help", (ctx) => {
		void ctx.reply(HELP_TEXT);
	});

	bot.command("last", (ctx) => {
		const ms = settings.last_journal_saved_epoch_ms;
		const line =
			ms > 0
				? `Last journal line saved: ${new Date(ms).toLocaleString()} (this device’s clock).`
				: "No journal line recorded yet (or data was cleared). Send a message that gets saved first.";
		void ctx.reply(line);
	});
}

async function transcribeAndAppend(
	ctx: Context,
	msg: Message,
	settings: JournalSettings,
	writer: DailyNoteWriter,
	token: string,
	log: HandlerLog,
	kind: "voice" | "audio" | "document"
): Promise<void> {
	if (!isMediaDownloadAllowedByNetworkPolicy(settings)) {
		log(
			"Transcribe skipped: Wi‑Fi only setting and network looks cellular."
		);
		void ctx.reply(
			"Transcription needs to download the audio. Wi‑Fi only is on and this connection looks cellular — try on Wi‑Fi or change the setting."
		);
		return;
	}

	log(
		`Transcribe (${kind}): getFile… message_id=${String(msg.message_id)}`
	);
	const file = await ctx.getFile();
	if (!file.file_path) {
		log("Transcribe: no file_path from Telegram.");
		void ctx.reply("Could not resolve voice/audio file path.");
		return;
	}

	if (!assertFileSizeForBotDownload(file, ctx, log)) {
		return;
	}

	const buf = await downloadTelegramFile(token, file.file_path);
	log(
		`Transcribe: downloaded ${String(buf.byteLength)} bytes (${file.file_path})`
	);
	const filename = pickAudioFilename(file.file_path);
	log(`Transcribe: ASR POST model=${settings.asr_model}…`);
	const transcript = await transcribeWithLocalAsr(settings, buf, filename);
	const label =
		kind === "voice"
			? "(voice)"
			: kind === "document"
				? "(audio file)"
				: "(audio)";
	log(`Transcribe: OK, length ${String(transcript.length)} chars`);
	let body = `${label}\n\n${transcript}`;
	body = prefixBodyWithReplyContext(body, msg, settings);
	await writer.appendBlock(body, msg);
	await executePostAction(ctx, settings, log);
}

export function setupMessageHandlers(
	bot: Bot,
	settings: JournalSettings,
	writer: DailyNoteWriter,
	token: string,
	log: HandlerLog = () => {}
): void {
	bot.on(["message:text", "channel_post:text"], async (ctx) => {
		const msg = ctx.msg as Message;
		let text = messageToObsidianText(msg, settings).trim();
		if (!text) {
			return;
		}

		text = prefixBodyWithReplyContext(text, msg, settings);

		try {
			log(`Text message: ${String(text.length)} chars`);
			await writer.appendBlock(text, msg);
			await executePostAction(ctx, settings, log);
		} catch (err) {
			handleVaultError(ctx, err, "append text to daily note", log);
		}
	});

	bot.on(
		["message:voice", "message:audio", "channel_post:voice", "channel_post:audio"],
		async (ctx) => {
			const msg = ctx.msg as Message;
			if (settings.transcription_enabled) {
				try {
					await transcribeAndAppend(
						ctx,
						msg,
						settings,
						writer,
						token,
						log,
						msg.voice ? "voice" : "audio"
					);
				} catch (err) {
					handleVaultError(ctx, err, "transcribe and append", log);
				}
				return;
			}
			if (settings.download_media) {
				try {
					await downloadAndAppendMedia(
						ctx,
						msg,
						settings,
						writer,
						token,
						log
					);
				} catch (err) {
					handleVaultError(ctx, err, "download media", log);
				}
				return;
			}
			log(
				"Voice/audio received: enable transcription or download media in settings."
			);
		}
	);

	bot.on(["message:document", "channel_post:document"], async (ctx) => {
		const msg = ctx.msg as Message;
		const audioLike = isAudioLikeDocument(msg);

		if (audioLike) {
			if (settings.transcription_enabled) {
				try {
					log("Audio-like document: starting transcription…");
					await transcribeAndAppend(
						ctx,
						msg,
						settings,
						writer,
						token,
						log,
						"document"
					);
				} catch (err) {
					handleVaultError(ctx, err, "transcribe and append", log);
				}
				return;
			}
			if (settings.download_media) {
				try {
					await downloadAndAppendMedia(
						ctx,
						msg,
						settings,
						writer,
						token,
						log
					);
				} catch (err) {
					handleVaultError(ctx, err, "download media", log);
				}
				return;
			}
			log(
				"Audio document received: enable transcription or download media in settings."
			);
			return;
		}

		if (!settings.download_media) {
			return;
		}

		try {
			await downloadAndAppendMedia(ctx, msg, settings, writer, token, log);
		} catch (err) {
			handleVaultError(ctx, err, "download media", log);
		}
	});

	bot.on(
		[
			"message:photo",
			"channel_post:photo",
			"message:video",
			"channel_post:video",
			"message:animation",
			"channel_post:animation",
			"message:video_note",
			"channel_post:video_note",
			"message:sticker",
			"channel_post:sticker",
		],
		async (ctx) => {
			if (!settings.download_media) {
				return;
			}
			try {
				await downloadAndAppendMedia(
					ctx,
					ctx.msg as Message,
					settings,
					writer,
					token,
					log
				);
			} catch (err) {
				handleVaultError(ctx, err, "download media", log);
			}
		}
	);
}
