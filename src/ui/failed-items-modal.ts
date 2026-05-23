import {
	ButtonComponent,
	Modal,
	Notice,
	Setting,
	type App,
} from "obsidian";
import type { LocalImportJob } from "../remote/types";

export interface FailedItemsModalApi {
	getFailedImportJobs(): LocalImportJob[];
	retryFailedJobs(eventId?: string): Promise<void>;
}

export class FailedItemsModal extends Modal {
	constructor(
		app: App,
		private readonly api: FailedItemsModalApi
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Failed journal items");
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const failed = this.api.getFailedImportJobs();
		if (failed.length === 0) {
			contentEl.createEl("p", {
				text: "No failed imports or transcription jobs.",
			});
			return;
		}

		new Setting(contentEl)
			.setName("Retry all")
			.setDesc(
				"Retry all failed imports and transcription jobs in the local queue."
			)
			.addButton((btn) =>
				btn.setButtonText("Retry all").onClick(async () => {
					await this.api.retryFailedJobs();
					new Notice("Retry scheduled for all failed items.");
					this.render();
				})
			);

		for (const job of failed) {
			const when =
				job.lastAttemptEpochMs > 0
					? new Date(job.lastAttemptEpochMs).toLocaleString()
					: "never";
			const row = contentEl.createDiv({ cls: "tg-journal-failed-item" });
			row.createEl("strong", {
				text: `${job.state} · chat ${String(job.chatId)} · message ${String(job.messageId)}`,
			});
			row.createEl("p", {
				text: `Note: ${job.notePath || "not written yet"}`,
			});
			row.createEl("p", {
				text: `Last error: ${job.lastError || "unknown"} · Attempts: ${String(job.retryCount)} · Last try: ${when}`,
			});
			new ButtonComponent(row)
				.setButtonText("Retry")
				.onClick(async () => {
					await this.api.retryFailedJobs(job.eventId);
					new Notice(
						`Retry scheduled for message ${String(job.messageId)}.`
					);
					this.render();
				});
		}
	}
}
