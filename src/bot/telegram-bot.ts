import { Bot } from "grammy";
import type { Vault } from "obsidian";
import type { JournalSettings } from "../settings/types";
import {
	createRecordUpdateIdMiddleware,
	createRestrictToAllowedUsersMiddleware,
} from "./middleware";
import { DailyNoteWriter } from "./daily-writer";
import { setupCommands, setupMessageHandlers } from "./handlers";

const DEFAULT_OFFSET = 1;

export class TelegramJournalBot {
	bot: Bot;
	vault: Vault;
	settings: JournalSettings;
	update_id = 0;
	private writer: DailyNoteWriter;

	constructor(vault: Vault, settings: JournalSettings) {
		this.vault = vault;
		this.settings = settings;
		this.writer = new DailyNoteWriter(vault, settings);
		this.bot = new Bot(settings.token);

		if (settings.disable_auto_reception) {
			void this.bot.init().catch((e: unknown) => {
				console.error("Telegram bot init failed:", e);
			});
		}

		this.setupMiddlewares();
		this.setupHandlers();
		this.setupErrorHandling();
	}

	private setupMiddlewares(): void {
		this.bot.use(createRestrictToAllowedUsersMiddleware(this.settings));
		this.bot.use(
			createRecordUpdateIdMiddleware((id) => {
				this.update_id = id;
			})
		);
	}

	private setupHandlers(): void {
		setupCommands(this.bot, this.settings, this.writer);
		setupMessageHandlers(
			this.bot,
			this.settings,
			this.writer,
			this.settings.token
		);
	}

	private setupErrorHandling(): void {
		this.bot.catch((err) => {
			console.error("Telegram bot error:", err);
		});
	}

	start(): void {
		void this.bot.start().catch((e: unknown) => {
			console.error("Telegram bot start failed:", e);
		});
	}

	async getUpdates(): Promise<void> {
		try {
			const offset = this.update_id ? this.update_id + 1 : DEFAULT_OFFSET;
			const updates = await this.bot.api.getUpdates({ offset });

			for (const update of updates) {
				await this.bot.handleUpdate(update);
			}

			if (updates.length > 0 && this.update_id) {
				await this.bot.api.getUpdates({
					offset: this.update_id + 1,
					limit: 1,
				});
			}
		} catch (error) {
			console.error("Error getting updates:", error);
			throw error;
		}
	}
}
