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

export function insertTextBeforeMarker(
	existingContent: string,
	marker: string,
	text: string
): string {
	const idx = existingContent.indexOf(marker);
	if (idx === -1) {
		return existingContent;
	}
	const transcript = text.trim();
	if (transcript === "") {
		return existingContent;
	}
	const beforeMarker = existingContent.slice(0, idx);
	if (beforeMarker.endsWith(`\n\n${transcript}\n\n`)) {
		return existingContent;
	}
	return (
		beforeMarker.replace(/\s*$/, "") +
		`\n\n${transcript}\n\n` +
		existingContent.slice(idx)
	);
}

export async function insertMessage(
	vault: Vault,
	message: string,
	tFile: TFile
): Promise<void> {
	await vault.process(tFile, (data) => appendMessage(data, message));
}
