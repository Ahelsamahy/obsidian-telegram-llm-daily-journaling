import { moment } from "obsidian";
import type { File, Message } from "grammy/types";

export function getExt(filePath: string): string {
	const base = filePath.split("/").pop() ?? "";
	const dot = base.lastIndexOf(".");
	return dot === -1 ? "bin" : base.slice(dot + 1) || "bin";
}

function sanitizeSegment(value: string): string {
	const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "");
	return cleaned === "" ? "unknown" : cleaned;
}

export function formatDeterministicMediaFilename(input: {
	messageDateUnix: number;
	chatId: number | string;
	messageId: number | string;
	fileUniqueId: string;
	extension: string;
}): string {
	const dateStr = moment
		.unix(input.messageDateUnix)
		.format("YYYYMMDD-HHmmss");
	const chatId = sanitizeSegment(String(input.chatId));
	const messageId = sanitizeSegment(String(input.messageId));
	const fileUniqueId = sanitizeSegment(input.fileUniqueId);
	const extension = sanitizeSegment(input.extension.replace(/^\./, ""));
	return `${dateStr}-chat${chatId}-msg${messageId}-file${fileUniqueId}.${extension}`;
}

export function generateMediaFilename(msg: Message, file: File): string {
	return formatDeterministicMediaFilename({
		messageDateUnix: msg.date,
		chatId: msg.chat.id,
		messageId: msg.message_id,
		fileUniqueId: file.file_unique_id ?? "unknown",
		extension: getExt(file.file_path ?? ""),
	});
}
