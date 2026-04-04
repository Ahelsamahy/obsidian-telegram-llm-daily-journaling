import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	setTooltip,
	type TextComponent,
} from "obsidian";
import type { ActionAfterReception, JournalPluginApi } from "./settings/types";

export class JournalSettingTab extends PluginSettingTab {
	plugin: JournalPluginApi;

	constructor(app: App, plugin: Plugin & JournalPluginApi) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private static readonly BOT_TOKEN_VISIBLE_PREFIX = 6;

	/** Plain text: first N characters visible, remainder shown as asterisks. */
	static formatTokenMasked(token: string): string {
		const t = token.trim();
		if (t.length === 0) {
			return "";
		}
		const n = JournalSettingTab.BOT_TOKEN_VISIBLE_PREFIX;
		if (t.length <= n) {
			return t;
		}
		return t.slice(0, n) + "*".repeat(t.length - n);
	}

	private applyBotTokenMaskedDisplay(text: TextComponent): void {
		text.setValue(
			JournalSettingTab.formatTokenMasked(this.plugin.settings.token)
		);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Telegram").setHeading();

		new Setting(containerEl)
			.setName("Bot token")
			.setDesc(
				"From @BotFather. Stored only in this vault. When not editing, the first six characters stay visible and the rest is shown as asterisks."
			)
			.addText((text) => {
				text.setPlaceholder("Paste bot token from @BotFather");
				setTooltip(
					text.inputEl,
					"Click the field to edit the full token. After you leave the field, only the first six characters stay readable."
				);
				this.applyBotTokenMaskedDisplay(text);
				text.inputEl.addEventListener("focus", () => {
					text.setValue(this.plugin.settings.token.trim());
				});
				text.inputEl.addEventListener("blur", () => {
					void (async () => {
						this.plugin.settings.token = text.getValue().trim();
						await this.plugin.saveSettings();
						this.applyBotTokenMaskedDisplay(text);
					})();
				});
			});

		new Setting(containerEl)
			.setName("Allowed users")
			.setDesc(
				"Comma-separated Telegram usernames (without @) or numeric user/chat IDs."
			)
			.addText((text) => {
				text.setPlaceholder("user1,12345678")
					.setValue(this.plugin.settings.allow_users.join(","))
					.onChange(async (value) => {
						this.plugin.settings.allow_users = value
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Disable auto reception")
			.setDesc(
				"When enabled, the bot does not poll automatically. Use the ribbon action or command to fetch updates."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.disable_auto_reception)
					.onChange(async (value) => {
						this.plugin.settings.disable_auto_reception = value;
						await this.plugin.saveSettings();
						await this.plugin.initBot();
					})
			);

		new Setting(containerEl).setName("Daily note").setHeading();

		new Setting(containerEl)
			.setName("Daily note time cutoff")
			.setDesc(
				"Messages before this clock time count toward the previous calendar day. Format HH:MM (24h)."
			)
			.addText((text) =>
				text
					.setPlaceholder("00:00")
					.setValue(this.plugin.settings.daily_note_time_cutoff)
					.onChange(async (value) => {
						this.plugin.settings.daily_note_time_cutoff = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("After message is saved").setHeading();

		const syncReactionEmojiVisibility = (emojiField: TextComponent) => {
			const show =
				this.plugin.settings.action_after_reception === "reaction";
			emojiField.inputEl.style.display = show ? "" : "none";
			emojiField.setDisabled(!show);
		};

		let reactionEmojiField!: TextComponent;

		new Setting(containerEl)
			.setName("Action after reception")
			.setDesc(
				"After your message is saved to the daily note, choose what the bot does in Telegram: leave the chat as-is, react with an emoji (pick Reaction and type the emoji in the field on the right), or delete the inbound message."
			)
			.setClass("tg-journal-after-saved")
			.addDropdown((dropdown) => {
				dropdown.addOption("none", "None");
				dropdown.addOption("reaction", "Reaction");
				dropdown.addOption("delete", "Delete message");
				dropdown.setValue(this.plugin.settings.action_after_reception);
				dropdown.onChange(async (value) => {
					this.plugin.settings.action_after_reception =
						value as ActionAfterReception;
					await this.plugin.saveSettings();
					syncReactionEmojiVisibility(reactionEmojiField);
				});
			})
			.addText((text) => {
				reactionEmojiField = text;
				text.inputEl.addClass("tg-journal-reaction-emoji-input");
				setTooltip(
					text.inputEl,
					"Emoji the bot will react with (e.g. ❤️ 👍 🔥)."
				);
				text
					.setPlaceholder("with ❤️")
					.setValue(this.plugin.settings.reaction_emoji)
					.onChange(async (value: string) => {
						this.plugin.settings.reaction_emoji = value.trim() || "❤";
						await this.plugin.saveSettings();
					});
				syncReactionEmojiVisibility(reactionEmojiField);
			});

		new Setting(containerEl)
			.setName("Local transcription (Qwen ASR)")
			.setHeading();

		new Setting(containerEl)
			.setName("Enable transcription")
			.setDesc(
				"Transcribe voice and audio messages via a local OpenAI-compatible server (e.g. mlx-qwen3-asr serve)."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.transcription_enabled)
					.onChange(async (value) => {
						this.plugin.settings.transcription_enabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ASR base URL")
			.setDesc("OpenAI-compatible root, usually ending in /v1")
			.addText((text) =>
				text
					.setPlaceholder("http://127.0.0.1:8765/v1")
					.setValue(this.plugin.settings.asr_base_url)
					.onChange(async (value) => {
						this.plugin.settings.asr_base_url = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ASR API key")
			.setDesc("Optional Bearer token if your local server requires it.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("")
					.setValue(this.plugin.settings.asr_api_key)
					.onChange(async (value) => {
						this.plugin.settings.asr_api_key = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("ASR model id")
			.setDesc(
				"Must match a model name served by your local ASR (e.g. Qwen/Qwen3-ASR-0.6B)."
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.asr_model)
					.onChange(async (value) => {
						this.plugin.settings.asr_model = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Actions").setHeading();

		new Setting(containerEl)
			.setName("Restart bot")
			.setDesc("Reload settings and reconnect to Telegram.")
			.addButton((btn) =>
				btn.setButtonText("Restart").onClick(async () => {
					await this.plugin.initBot();
				})
			);
	}
}
