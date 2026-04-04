import {
	App,
	ButtonComponent,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	setTooltip,
	SliderComponent,
	TextAreaComponent,
	ToggleComponent,
	type TextComponent,
} from "obsidian";
import type { ActionAfterReception, JournalPluginApi } from "./settings/types";

export class JournalSettingTab extends PluginSettingTab {
	plugin: JournalPluginApi;
	private diagAutoRefreshInterval: number | null = null;

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

	private clearDiagAutoRefresh(): void {
		if (this.diagAutoRefreshInterval !== null) {
			window.clearInterval(this.diagAutoRefreshInterval);
			this.diagAutoRefreshInterval = null;
		}
	}

	hide(): void {
		this.clearDiagAutoRefresh();
		super.hide();
	}

	display(): void {
		const { containerEl } = this;

		this.clearDiagAutoRefresh();
		containerEl.empty();

		new Setting(containerEl).setName("Telegram").setHeading();

		new Setting(containerEl)
			.setName("Bot token")
			.setDesc(
				createFragment((f) => {
					f.appendText("From ");
					f.createEl("a", {
						text: "@BotFather",
						href: "https://telegram.me/BotFather",
						attr: {
							target: "_blank",
							rel: "noopener noreferrer",
						},
					});
					f.appendText(
						". Stored only in this vault. When not editing, the first six characters stay visible and the rest is shown as asterisks."
					);
				})
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
				createFragment((f) => {
					f.appendText(
						"Comma-separated Telegram usernames (without @) or numeric user/chat IDs. To look up your numeric ID, open "
					);
					f.createEl("a", {
						text: "@getmyid_bot",
						href: "https://t.me/getmyid_bot",
						attr: {
							target: "_blank",
							rel: "noopener noreferrer",
						},
					});
					f.appendText(" in Telegram.");
				})
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

		new Setting(containerEl)
			.setName("Timestamp heading per entry")
			.setDesc(
				"When enabled, each captured message is prefixed with a markdown heading (###) showing the message date and time (YYYY-MM-DD HH:mm). When off, only the message text is appended."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.entry_timestamp_heading)
					.onChange(async (value) => {
						this.plugin.settings.entry_timestamp_heading = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Message text").setHeading();

		let markdownEscaperToggle: ToggleComponent | undefined;

		new Setting(containerEl)
			.setName("Plain text only (no Telegram formatting)")
			.setDesc(
				"When enabled, the raw message text or caption is stored (Telegram bold, links, etc. are not turned into Markdown). When off, Telegram entities are converted to Markdown (bold, italics, links, …), similar to telegram-inbox."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.remove_formatting)
					.onChange(async (value) => {
						this.plugin.settings.remove_formatting = value;
						await this.plugin.saveSettings();
						markdownEscaperToggle?.setDisabled(value);
					})
			);

		new Setting(containerEl)
			.setName("Escape Markdown when using formatting")
			.setDesc(
				"Only applies when plain text is off. Escapes special characters in the converted Markdown (Telegram MarkdownV2-style escaping)."
			)
			.addToggle((toggle) => {
				markdownEscaperToggle = toggle;
				toggle
					.setValue(this.plugin.settings.markdown_escaper)
					.setDisabled(this.plugin.settings.remove_formatting)
					.onChange(async (value) => {
						this.plugin.settings.markdown_escaper = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Media").setHeading();

		const downloadDirContainer = containerEl.createDiv();

		new Setting(containerEl)
			.setName("Download media to vault")
			.setDesc(
				"Save photos, videos, stickers, non-audio documents, and voice/audio files (when transcription is off) into a folder and add an embed to the daily note."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.download_media)
					.onChange(async (value) => {
						this.plugin.settings.download_media = value;
						await this.plugin.saveSettings();
						downloadDirContainer.style.display = value ? "" : "none";
					})
			);

		downloadDirContainer.style.display = this.plugin.settings.download_media
			? ""
			: "none";

		new Setting(downloadDirContainer)
			.setName("Media folder")
			.setDesc("Folder path under the vault root (e.g. assets/telegram). Created if missing.")
			.addText((text) =>
				text
					.setPlaceholder("assets/telegram")
					.setValue(this.plugin.settings.download_dir)
					.onChange(async (value) => {
						this.plugin.settings.download_dir = value.trim();
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

		new Setting(containerEl).setName("Diagnostics").setHeading();

		let diagIntervalSlider: SliderComponent | undefined;
		const diagLogRef: { area: TextAreaComponent | undefined } = {
			area: undefined,
		};

		const scheduleDiagAutoRefresh = () => {
			this.clearDiagAutoRefresh();
			if (!this.plugin.settings.diagnostic_log_auto_refresh) {
				return;
			}
			const sec = Math.min(
				30,
				Math.max(
					1,
					Math.round(this.plugin.settings.diagnostic_log_auto_refresh_interval_sec)
				)
			);
			this.diagAutoRefreshInterval = window.setInterval(() => {
				diagLogRef.area?.setValue(this.plugin.getDiagnosticLogText());
			}, sec * 1000);
		};

		new Setting(containerEl)
			.setName("Auto-refresh diagnostics log")
			.setDesc(
				"While this settings panel is open, reload the log from memory on a timer so you do not need to use Refresh."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.diagnostic_log_auto_refresh)
					.onChange(async (value) => {
						this.plugin.settings.diagnostic_log_auto_refresh = value;
						await this.plugin.saveSettings();
						diagIntervalSlider?.setDisabled(!value);
						scheduleDiagAutoRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Diagnostics refresh interval")
			.setDesc("Seconds between automatic log updates (only while this panel is open).")
			.addSlider((slider) => {
				diagIntervalSlider = slider;
				slider
					.setLimits(1, 30, 1)
					.setValue(
						Math.min(
							30,
							Math.max(
								1,
								this.plugin.settings.diagnostic_log_auto_refresh_interval_sec
							)
						)
					)
					.setDynamicTooltip()
					.setDisabled(!this.plugin.settings.diagnostic_log_auto_refresh)
					.onChange(async (value) => {
						this.plugin.settings.diagnostic_log_auto_refresh_interval_sec =
							value;
						await this.plugin.saveSettings();
						scheduleDiagAutoRefresh();
					});
			});

		const diagBlock = containerEl.createDiv({ cls: "tg-journal-diagnostics" });
		diagBlock.createEl("p", {
			cls: "tg-journal-diagnostics-desc setting-item-description",
			text: "Activity log — recent bot activity: allowed/blocked users, downloads, ASR, errors. Each line starts with a timestamp in your computer’s local timezone (not UTC). If auto-refresh is enabled above, the log reloads on that interval while this settings panel stays open. The same lines are also sent to the developer console (Ctrl+Shift+I or ⌥⌘I; enable Verbose to see debug output).",
		});

		const taWrap = diagBlock.createDiv({ cls: "tg-journal-diag-textarea-wrap" });
		const diagLogArea = new TextAreaComponent(taWrap);
		diagLogRef.area = diagLogArea;
		diagLogArea.inputEl.rows = 16;
		diagLogArea.inputEl.readOnly = true;
		diagLogArea.inputEl.addClass("tg-journal-diag-log");
		diagLogArea.setValue(this.plugin.getDiagnosticLogText());

		scheduleDiagAutoRefresh();

		const toolbar = diagBlock.createDiv({ cls: "tg-journal-diag-toolbar" });
		new ButtonComponent(toolbar)
			.setButtonText("Refresh")
			.setTooltip("Reload log from memory now")
			.onClick(() => {
				diagLogArea.setValue(this.plugin.getDiagnosticLogText());
			});
		new ButtonComponent(toolbar)
			.setButtonText("Clear log")
			.setTooltip("Empty the log buffer")
			.onClick(() => {
				this.plugin.clearDiagnosticLog();
				diagLogArea.setValue("");
			});
		new ButtonComponent(toolbar)
			.setButtonText("Copy all")
			.setTooltip("Copy log to clipboard")
			.onClick(() => {
				void navigator.clipboard
					.writeText(this.plugin.getDiagnosticLogText())
					.then(() => {
						new Notice("Log copied to clipboard.");
					});
			});
	}
}
