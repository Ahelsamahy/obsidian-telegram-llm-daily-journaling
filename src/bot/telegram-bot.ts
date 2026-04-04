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

export type TelegramJournalBotOptions = {
	log?: (message: string) => void;
};

export class TelegramJournalBot {
	bot: Bot;
	vault: Vault;
	settings: JournalSettings;
	update_id = 0;
	private writer: DailyNoteWriter;
	private log: (message: string) => void;

	constructor(
		vault: Vault,
		settings: JournalSettings,
		options?: TelegramJournalBotOptions
	) {
		this.vault = vault;
		this.settings = settings;
		this.log = options?.log ?? (() => {});
		this.writer = new DailyNoteWriter(vault, settings);
		this.bot = new Bot(settings.token);

		if (settings.disable_auto_reception) {
			void this.bot.init().catch((e: unknown) => {
				console.error("Telegram bot init failed:", e);
				this.log(
					`Bot init error: ${e instanceof Error ? e.message : String(e)}`
				);
			});
		}

		this.setupMiddlewares();
		this.setupHandlers();
		this.setupErrorHandling();
	}

	private setupMiddlewares(): void {
		this.bot.use(createRestrictToAllowedUsersMiddleware(this.settings, this.log));
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
			this.settings.token,
			this.log
		);
	}

	private setupErrorHandling(): void {
		this.bot.catch((err) => {
			console.error("Telegram bot error:", err);
			this.log(
				`Bot error: ${err instanceof Error ? err.message : String(err)}`
			);
		});
	}

	start(): void {
		void this.bot.start().catch((e: unknown) => {
			console.error("Telegram bot start failed:", e);
			this.log(
				`start() failed: ${e instanceof Error ? e.message : String(e)}`
			);
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
			this.log(
				`getUpdates error: ${error instanceof Error ? error.message : String(error)}`
			);
			throw error;
		}
	}
}
