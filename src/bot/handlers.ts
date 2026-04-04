import { requestUrl } from "obsidian";
import type { Bot, Context } from "grammy";
import type { Message } from "grammy/types";
import type { JournalSettings } from "../settings/types";
import type { DailyNoteWriter } from "./daily-writer";
import { transcribeWithLocalAsr } from "./asr";

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
			// grammy types only list a fixed emoji union; user-configurable emoji needs a widened call
			await ctx.react(settings.reaction_emoji as never);
		} catch (err) {
			console.error("Failed to set reaction:", err);
		}
	}
}

function handleVaultError(ctx: Context, err: unknown, context: string): void {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(`Failed to ${context}: ${msg}`, err);
	void ctx.reply(`Failed to ${context}. ${msg}`);
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

export function setupCommands(
	bot: Bot,
	_settings: JournalSettings,
	_writer: DailyNoteWriter
): void {
	bot.command("start", (ctx) => {
		void ctx.reply(
			"Send text to append to your Obsidian daily note. Voice messages are transcribed when transcription is enabled."
		);
	});
}

export function setupMessageHandlers(
	bot: Bot,
	settings: JournalSettings,
	writer: DailyNoteWriter,
	token: string
): void {
	bot.on(["message:text", "channel_post:text"], async (ctx) => {
		const msg = ctx.msg as Message;
		const text = msg.text ?? "";
		if (!text) {
			return;
		}

		try {
			await writer.appendBlock(text, msg);
			await executePostAction(ctx, settings);
		} catch (err) {
			handleVaultError(ctx, err, "append text to daily note");
		}
	});

	bot.on(
		["message:voice", "message:audio", "channel_post:voice", "channel_post:audio"],
		async (ctx) => {
			if (!settings.transcription_enabled) {
				return;
			}

			const msg = ctx.msg as Message;
			try {
				const file = await ctx.getFile();
				if (!file.file_path) {
					void ctx.reply("Could not resolve voice/audio file path.");
					return;
				}

				const buf = await downloadTelegramFile(token, file.file_path);
				const filename = pickAudioFilename(file.file_path);
				const transcript = await transcribeWithLocalAsr(
					settings,
					buf,
					filename
				);
				const label = msg.voice ? "(voice)" : "(audio)";
				await writer.appendBlock(`${label}\n\n${transcript}`, msg);
				await executePostAction(ctx, settings);
			} catch (err) {
				handleVaultError(ctx, err, "transcribe and append");
			}
		}
	);
}
