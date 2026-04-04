import { Mutex } from "async-mutex";
import { moment, TFile, type Vault } from "obsidian";
import type { Message } from "grammy/types";
import type { JournalSettings } from "../settings/types";
import { getDiaryWithTimeCutoff } from "../utils/diary";
import { insertMessage } from "../io";

/** Formats text to append to the daily note (leading newline, optional time heading, body). */
export function formatJournalBlock(
	settings: Pick<JournalSettings, "entry_timestamp_heading">,
	body: string,
	msgDateUnix: number
): string {
	const trimmed = body.trim();
	if (trimmed === "") {
		return "\n";
	}
	if (settings.entry_timestamp_heading) {
		const t = moment.unix(msgDateUnix).format("YYYY-MM-DD HH:mm");
		return `\n### ${t}\n\n${trimmed}\n`;
	}
	return `\n${trimmed}\n`;
}

export class DailyNoteWriter {
	private mutex = new Mutex();

	constructor(
		private vault: Vault,
		private settings: JournalSettings
	) {}

	getVault(): Vault {
		return this.vault;
	}

	async appendBlock(body: string, msg: Message): Promise<void> {
		const release = await this.mutex.acquire();
		try {
			const msgDate = moment.unix(msg.date);
			const file = await getDiaryWithTimeCutoff(this.settings, msgDate);
			if (!(file instanceof TFile)) {
				throw new Error("Daily note path did not resolve to a file");
			}
			const block = this.formatBlock(body, msg);
			await insertMessage(this.vault, block, file);
		} finally {
			release();
		}
	}

	private formatBlock(body: string, msg: Message): string {
		return formatJournalBlock(this.settings, body, msg.date);
	}
}
