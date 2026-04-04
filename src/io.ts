import type { TFile, Vault } from "obsidian";

export function appendMessage(existingContent: string, message: string): string {
	const trimmed = existingContent.trim();

	if (trimmed === "") {
		return message;
	}

	if (existingContent.endsWith("\n")) {
		return `${existingContent}${message}`;
	}

	return `${existingContent}\n${message}`;
}

export async function insertMessage(
	vault: Vault,
	message: string,
	tFile: TFile
): Promise<void> {
	await vault.process(tFile, (data) => appendMessage(data, message));
}
