import { moment } from "obsidian";
import type { File, Message } from "grammy/types";

export function getExt(filePath: string): string {
	const base = filePath.split("/").pop() ?? "";
	const dot = base.lastIndexOf(".");
	return dot === -1 ? "bin" : base.slice(dot + 1) || "bin";
}

export function generateMediaFilename(msg: Message, file: File): string {
	const message_id = msg.message_id;
	const dateStr = moment.unix(msg.date).format("YYYYMMDD");
	const extension = getExt(file.file_path ?? "");
	return `${dateStr}-${String(message_id)}.${extension}`;
}
