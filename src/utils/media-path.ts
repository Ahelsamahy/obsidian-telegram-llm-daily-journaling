import { normalizePath, type TFile } from "obsidian";
import type { Message } from "grammy/types";
import { formatDeterministicMediaFilename } from "../bot/media-filename";

export function buildVaultMediaPath(input: {
	noteFile: TFile;
	mediaSubfolderName: string;
	messageDateUnix: number;
	chatId: number | string;
	messageId: number | string;
	fileUniqueId: string;
	extension: string;
}): string {
	const noteDir =
		input.noteFile.parent?.path && input.noteFile.parent.path !== "/"
			? input.noteFile.parent.path
			: "";
	const filename = formatDeterministicMediaFilename({
		messageDateUnix: input.messageDateUnix,
		chatId: input.chatId,
		messageId: input.messageId,
		fileUniqueId: input.fileUniqueId,
		extension: input.extension,
	});
	return normalizePath(
		noteDir === ""
			? `${input.mediaSubfolderName}/${filename}`
			: `${noteDir}/${input.mediaSubfolderName}/${filename}`
	).replace(/^\/+/, "");
}

export function buildVaultMediaPathForMessage(
	noteFile: TFile,
	mediaSubfolderName: string,
	msg: Message,
	fileUniqueId: string,
	extension: string
): string {
	return buildVaultMediaPath({
		noteFile,
		mediaSubfolderName,
		messageDateUnix: msg.date,
		chatId: msg.chat.id,
		messageId: msg.message_id,
		fileUniqueId,
		extension,
	});
}
