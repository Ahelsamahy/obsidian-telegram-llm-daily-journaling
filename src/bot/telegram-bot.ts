import { Bot } from "grammy";
import type { Vault } from "obsidian";
import type { JournalSettings } from "../settings/types";
import {
	createIdempotentUpdateMiddleware,
	createRecordUpdateIdMiddleware,
	createRestrictToAllowedUsersMiddleware,
} from "./middleware";
import { DailyNoteWriter } from "./daily-writer";
import { setupCommands, setupMessageHandlers } from "./handlers";

const DEFAULT_OFFSET = 1;

export type TelegramJournalBotOptions = {
	log?: (message: string) => void;
	/** Called after a line is appended to the daily note (vault write succeeded). */
	onJournalSaved?: () => void | Promise<void>;
	getLastProcessedUpdateId?: () => number;
	persistProcessedUpdateId?: (updateId: number) => void | Promise<void>;
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
		this.writer = new DailyNoteWriter(vault, settings, options?.onJournalSaved);
		this.bot = new Bot(settings.token);

		if (settings.disable_auto_reception) {
			void this.bot.init().catch((e: unknown) => {
				console.error("Telegram bot init failed:", e);
				this.log(
					`Bot init error: ${e instanceof Error ? e.message : String(e)}`
				);
			});
		}

		this.setupMiddlewares(options);
		this.setupHandlers();
		this.setupErrorHandling();
	}

	private setupMiddlewares(options?: TelegramJournalBotOptions): void {
		this.bot.use(
			createRecordUpdateIdMiddleware((id) => {
				this.update_id = id;
			})
		);
		this.bot.use(createRestrictToAllowedUsersMiddleware(this.settings, this.log));
		if (
			options?.getLastProcessedUpdateId &&
			options?.persistProcessedUpdateId
		) {
			this.bot.use(
				createIdempotentUpdateMiddleware(
					options.getLastProcessedUpdateId,
					options.persistProcessedUpdateId,
					this.log
				)
			);
		}
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
			let offset = this.update_id ? this.update_id + 1 : DEFAULT_OFFSET;

			while (true) {
				const updates = await this.bot.api.getUpdates({
					offset,
					limit: 100,
				});
				if (updates.length === 0) {
					break;
				}

				for (const update of updates) {
					await this.bot.handleUpdate(update);
				}

				if (!this.update_id) {
					break;
				}

				offset = this.update_id + 1;
				await this.bot.api.getUpdates({
					offset,
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
