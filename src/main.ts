import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type JournalSettings } from "./settings/types";
import type { JournalPluginApi } from "./settings/types";
import { JournalSettingTab } from "./settings-tab";
import { TelegramJournalBot } from "./bot/telegram-bot";

export default class TelegramLlmDailyJournalPlugin
	extends Plugin
	implements JournalPluginApi
{
	settings: JournalSettings;
	bot: TelegramJournalBot | null = null;

	onload(): void {
		void this.bootstrap();
	}

	private async bootstrap(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new JournalSettingTab(this.app, this));
		this.registerCommands();

		await this.initBot();

		if (this.settings.disable_auto_reception) {
			this.addRibbonIcon(
				"send",
				"Telegram daily journal: get updates",
				() => {
					void this.safeGetUpdates();
				}
			);
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: "tg-daily-get-updates",
			name: "Telegram daily journal: get updates",
			callback: () => {
				void this.safeGetUpdates();
			},
		});

		this.addCommand({
			id: "tg-daily-start",
			name: "Telegram daily journal: start bot",
			callback: () => {
				this.startBot();
			},
		});

		this.addCommand({
			id: "tg-daily-stop",
			name: "Telegram daily journal: stop bot",
			callback: () => {
				void this.stopBot();
			},
		});
	}

	onunload(): void {
		void this.stopBot();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<JournalSettings>
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async initBot(): Promise<void> {
		try {
			if (!this.settings.token) {
				new Notice("Telegram bot token is not set.");
				return;
			}
			if (this.settings.allow_users.length === 0) {
				new Notice("Add at least one allowed user in settings.");
				return;
			}

			await this.stopBot();
			this.bot = new TelegramJournalBot(this.app.vault, this.settings);

			if (!this.settings.disable_auto_reception) {
				this.startBot();
			}
		} catch (error) {
			console.error("Telegram daily journal: failed to init bot", error);
			new Notice("Failed to start Telegram bot (see console).");
			this.bot = null;
		}
	}

	startBot(): void {
		if (this.bot) {
			new Notice("Telegram bot starting");
			this.bot.start();
		}
	}

	async stopBot(): Promise<void> {
		try {
			if (this.bot) {
				await this.bot.bot.stop();
			}
		} catch (error) {
			console.error("Error stopping Telegram bot:", error);
		} finally {
			this.bot = null;
		}
	}

	async getUpdates(): Promise<void> {
		if (!this.bot) {
			new Notice("Bot is not running.");
			return;
		}
		await this.bot.getUpdates();
	}

	private async safeGetUpdates(): Promise<void> {
		try {
			await this.getUpdates();
		} catch (e) {
			console.error(e);
			new Notice("Failed to get updates (see console).");
		}
	}
}
