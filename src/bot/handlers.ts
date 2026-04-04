import { normalizePath, requestUrl } from "obsidian";
import type { Bot, Context } from "grammy";
import type { Message } from "grammy/types";
import type { JournalSettings } from "../settings/types";
import type { DailyNoteWriter } from "./daily-writer";
import { transcribeWithLocalAsr } from "./asr";
import { downloadAndSaveFile } from "../utils/download";
import { messageToObsidianText } from "../utils/telegram-markdown";
import { generateMediaFilename } from "./media-filename";

export type HandlerLog = (message: string) => void;

async function executePostAction(
	ctx: Context,
	settings: JournalSettings
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
			console.error("Failed to set reaction:", err);
		}
	}
}

function handleVaultError(
	ctx: Context,
	err: unknown,
	context: string,
	log: HandlerLog
): void {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(`Failed to ${context}: ${msg}`, err);
	log(`Error (${context}): ${msg}`);
	void ctx.reply(`Failed to ${context}. ${msg}`);
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
	log(`Download media: getFile… message_id=${String(msg.message_id)}`);
	const file = await ctx.getFile();
	if (!file.file_path) {
		log("Download media: no file_path from Telegram.");
		void ctx.reply("Could not resolve media file path.");
		return;
	}

	const filename = generateMediaFilename(msg, file);
	const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
	const vaultPath = normalizePath(
		`${settings.download_dir}/${filename}`
	).replace(/^\/+/, "");

	const ok = await downloadAndSaveFile(writer.getVault(), url, vaultPath);
	if (!ok) {
		log(`Download media failed: ${vaultPath}`);
		void ctx.reply(`Failed to download media: ${filename}`);
		return;
	}

	const caption = messageToObsidianText(msg, settings).trim();
	const embedPath = vaultPath.replace(/^\/+/, "");
	const body = caption
		? `![[${embedPath}]]\n\n${caption}`
		: `![[${embedPath}]]`;
	log(
		`Download media OK: ${embedPath}${caption ? `, caption ${String(caption.length)} chars` : ""}`
	);
	await writer.appendBlock(body, msg);
	await executePostAction(ctx, settings);
}

export function setupCommands(
	bot: Bot,
	_settings: JournalSettings,
	_writer: DailyNoteWriter
): void {
	bot.command("start", (ctx) => {
		void ctx.reply(
			"Send text to append to your Obsidian daily note. Voice messages can be transcribed when transcription is enabled, or saved as files when download media is enabled."
		);
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
	log(
		`Transcribe (${kind}): getFile… message_id=${String(msg.message_id)}`
	);
	const file = await ctx.getFile();
	if (!file.file_path) {
		log("Transcribe: no file_path from Telegram.");
		void ctx.reply("Could not resolve voice/audio file path.");
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
	await writer.appendBlock(`${label}\n\n${transcript}`, msg);
	await executePostAction(ctx, settings);
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
		const text = messageToObsidianText(msg, settings).trim();
		if (!text) {
			return;
		}

		try {
			log(`Text message: ${String(text.length)} chars`);
			await writer.appendBlock(text, msg);
			await executePostAction(ctx, settings);
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
