import { Mutex } from "async-mutex";
import { moment, TFile, type Vault } from "obsidian";
import type { Message } from "grammy/types";
import type { JournalSettings } from "../settings/types";
import { getDiaryWithTimeCutoff } from "../utils/diary";
import { appendMessage } from "../io";

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

export function buildMessageReceiptMarker(msg: Message): string {
	return `%% tg-journal:chat=${String(msg.chat.id)};message=${String(msg.message_id)} %%`;
}

export function hasMessageReceiptMarker(
	existingContent: string,
	msg: Message
): boolean {
	return existingContent.includes(buildMessageReceiptMarker(msg));
}

export class DailyNoteWriter {
	private mutex = new Mutex();

	constructor(
		private vault: Vault,
		private settings: JournalSettings,
		private readonly onAppendSuccess?: () => void | Promise<void>
	) {}

	getVault(): Vault {
		return this.vault;
	}

	async appendBlock(body: string, msg: Message): Promise<boolean> {
		const release = await this.mutex.acquire();
		try {
			const msgDate = moment.unix(msg.date);
			const file = await getDiaryWithTimeCutoff(this.settings, msgDate);
			if (!(file instanceof TFile)) {
				throw new Error("Daily note path did not resolve to a file");
			}
			const block = this.formatBlock(body, msg);
			let appended = false;
			await this.vault.process(file, (existingContent) => {
				if (hasMessageReceiptMarker(existingContent, msg)) {
					return existingContent;
				}
				appended = true;
				return appendMessage(existingContent, block);
			});
			if (appended) {
				await Promise.resolve(this.onAppendSuccess?.());
			}
			return appended;
		} finally {
			release();
		}
	}

	private formatBlock(body: string, msg: Message): string {
		const withReceipt = `${body.trim()}\n\n${buildMessageReceiptMarker(msg)}`;
		return formatJournalBlock(this.settings, withReceipt, msg.date);
	}
}
