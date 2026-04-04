import {
	App,
	ButtonComponent,
	DropdownComponent,
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
import {
	CUSTOM_ASR_MODEL_DROPDOWN_VALUE,
	mergeAsrModelPickerIds,
} from "./utils/huggingface-asr-models";
import { WIKI_LOCAL_ASR_SETUP_URL } from "./const/wiki";
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

	/** Shell command to prefetch Hub weights (run from plugin repo after asr:install). */
	static formatAsrDownloadCommand(modelId: string): string {
		const id = modelId.trim() || "Qwen/Qwen3-ASR-1.7B";
		const escaped = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `# From this plugin repository (after npm run asr:install):\nnpm run asr:download-model -- "${escaped}"`;
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
						text: "@botfather",
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
				text.setPlaceholder("Paste bot token from @botfather");
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
				text.setPlaceholder("User1,12345678")
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
				createFragment((f) => {
					f.appendText(
						"Messages before this clock time count toward the previous calendar day. Format HH:MM (24h). Cutoff times and journal timestamps use "
					);
					f.createEl("strong", { text: "This device’s local clock" });
					f.appendText(
						" (the machine running Obsidian), not Telegram’s time zone."
					);
				})
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
				"When enabled, each captured message is prefixed with a Markdown heading (###) showing the message date and time (yyyy-mm-dd hh:mm). When off, only the message text is appended. If you edit the same daily note in Obsidian while a message is being saved, the vault usually merges writes; very fast simultaneous edits are rare."
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
				"When enabled, the raw message text or caption is stored (Telegram bold, links, etc. Are not turned into Markdown). When off, Telegram entities are converted to Markdown (bold, italics, links, …), similar to Telegram-inbox."
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
				"Only applies when plain text is off. Escapes special characters in the converted Markdown (Telegram markdownv2-style escaping)."
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

		new Setting(containerEl)
			.setName("Reply context in note")
			.setDesc(
				"When you reply to a message in Telegram, prepend a blockquote line (re: …) with a short preview of the message you replied to, so the thread is visible in the note."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.include_reply_context)
					.onChange(async (value) => {
						this.plugin.settings.include_reply_context = value;
						await this.plugin.saveSettings();
					})
			);

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
					.setPlaceholder("Assets/Telegram")
					.setValue(this.plugin.settings.download_dir)
					.onChange(async (value) => {
						this.plugin.settings.download_dir = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(downloadDirContainer)
			.setName("Wi‑fi only (downloads)")
			.setDesc(
				"When enabled, media downloads and transcription (audio download) run only if the browser reports wi‑fi or ethernet. If the connection type is unknown (typical on desktop), downloads are allowed. On Obsidian mobile, large downloads may use cellular data unless this blocks them."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.download_media_wifi_only)
					.onChange(async (value) => {
						this.plugin.settings.download_media_wifi_only = value;
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
				"After your message is saved to the daily note, choose what the bot does in Telegram: leave the chat as-is, react with an emoji (pick reaction and type the emoji in the field on the right), or delete the inbound message."
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
					.setPlaceholder("With ❤️")
					.setValue(this.plugin.settings.reaction_emoji)
					.onChange(async (value: string) => {
						this.plugin.settings.reaction_emoji = value.trim() || "❤";
						await this.plugin.saveSettings();
					});
				syncReactionEmojiVisibility(reactionEmojiField);
			});

		new Setting(containerEl)
			.setName("Local transcription (qwen asr)")
			.setHeading();

		new Setting(containerEl)
			.setName("Enable transcription")
			.setDesc(
				"Transcribe voice and audio messages via a local openai-compatible server (e.g. Mlx-qwen3-asr serve)."
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
			.setName("Asr base URL")
			.setDesc("Openai-compatible root, usually ending in /v1")
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
			.setName("Asr API key")
			.setDesc("Optional bearer token if your local server requires it.")
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
			.setName("Hugging face token (optional)")
			.setDesc(
				"Used only for “refresh from hugging face” (and gated hub listings). Not sent to your local asr server. Store in vault settings; never share or log it."
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("Hf_…")
					.setValue(this.plugin.settings.hf_token)
					.onChange(async (value) => {
						this.plugin.settings.hf_token = value.trim();
						await this.plugin.saveSettings();
					});
			});

		const pickerIds = mergeAsrModelPickerIds(
			this.plugin.settings.asr_hf_model_ids_cache
		);
		const initialModel = this.plugin.settings.asr_model.trim();
		const initialDropdownValue = pickerIds.includes(initialModel)
			? initialModel
			: CUSTOM_ASR_MODEL_DROPDOWN_VALUE;

		let modelDropdownRef!: DropdownComponent;
		let modelTextField!: TextComponent;

		const customModelContainer = containerEl.createDiv();

		const syncCustomModelRow = (): void => {
			const v = modelDropdownRef.getValue();
			customModelContainer.style.display =
				v === CUSTOM_ASR_MODEL_DROPDOWN_VALUE ? "" : "none";
		};

		new Setting(containerEl)
			.setName("Asr model")
			.setDesc(
				createFragment((f) => {
					f.appendText(
						"Preset or Hub list entry sets the model id in one click. Choose “Other” only when you need an id that is not listed. "
					);
					f.appendText("See ");
					f.createEl("a", {
						text: "Local asr setup (wiki)",
						href: WIKI_LOCAL_ASR_SETUP_URL,
						attr: {
							target: "_blank",
							rel: "noopener noreferrer",
						},
					});
					f.appendText(
						" for downloading model weights and running the server on your machine."
					);
				})
			)
			.addDropdown((dropdown) => {
				modelDropdownRef = dropdown;
				for (const id of pickerIds) {
					dropdown.addOption(id, id);
				}
				dropdown.addOption(
					CUSTOM_ASR_MODEL_DROPDOWN_VALUE,
					"Other (custom ID)…"
				);
				dropdown.setValue(initialDropdownValue);
				dropdown.onChange(async (value) => {
					if (value === CUSTOM_ASR_MODEL_DROPDOWN_VALUE) {
						modelTextField.setValue(this.plugin.settings.asr_model);
						syncCustomModelRow();
						return;
					}
					this.plugin.settings.asr_model = value;
					modelTextField.setValue(value);
					await this.plugin.saveSettings();
					syncCustomModelRow();
				});
			});

		new Setting(customModelContainer)
			.setName("Custom model ID")
			.setDesc(
				"Shown only for “other”. This value is what the plugin sends to your local asr server; prefetch weights on your machine via the button below (Obsidian cannot download models itself)."
			)
			.addText((text) => {
				modelTextField = text;
				text
					.setPlaceholder("Org/model-name")
					.setValue(
						initialDropdownValue === CUSTOM_ASR_MODEL_DROPDOWN_VALUE
							? this.plugin.settings.asr_model
							: ""
					)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.asr_model = trimmed;
						if (pickerIds.includes(trimmed)) {
							modelDropdownRef.setValue(trimmed);
						} else {
							modelDropdownRef.setValue(
								CUSTOM_ASR_MODEL_DROPDOWN_VALUE
							);
						}
						await this.plugin.saveSettings();
						syncCustomModelRow();
					});
			});

		syncCustomModelRow();

		new Setting(containerEl)
			.setName("Prefetch model weights (terminal)")
			.setDesc(
				createFragment((f) => {
					f.appendText(
						"Downloads the Hub snapshot into the Hugging Face cache using the same venv as asr:install (huggingface_hub). Set HF_TOKEN in .env for gated repos. Copy the command and run it in a terminal from the plugin source folder. Details: "
					);
					f.createEl("a", {
						text: "Wiki",
						href: WIKI_LOCAL_ASR_SETUP_URL,
						attr: {
							target: "_blank",
							rel: "noopener noreferrer",
						},
					});
					f.appendText(".");
				})
			)
			.addButton((btn) =>
				btn.setButtonText("Copy download command").onClick(() => {
					const cmd = JournalSettingTab.formatAsrDownloadCommand(
						this.plugin.settings.asr_model
					);
					void navigator.clipboard.writeText(cmd).then(
						() => {
							new Notice("Download command copied to clipboard.");
						},
						() => {
							new Notice("Could not copy (clipboard permission).");
						}
					);
				})
			);

		const cacheEpoch = this.plugin.settings.asr_hf_models_cache_epoch_ms;
		const lastRefreshHint =
			cacheEpoch > 0
				? ` Last Hub refresh: ${new Date(cacheEpoch).toLocaleString()}.`
				: "";

		new Setting(containerEl)
			.setName("Refresh asr models from hugging face")
			.setDesc(
				`Loads ASR model ids from the public Hub JSON API (pipeline automatic-speech-recognition). Results are cached in plugin data for offline use.${lastRefreshHint}`
			)
			.addButton((btn) =>
				btn.setButtonText("Refresh").onClick(async () => {
					const r =
						await this.plugin.refreshAsrModelsFromHuggingFace();
					if (r.ok) {
						new Notice(`Loaded ${r.count} ASR models from Hugging Face.`);
						this.display();
					} else {
						new Notice(
							`Refresh failed: ${r.error ?? "unknown"}. Presets and cached list still work.`
						);
					}
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
				"While this settings panel is open, reload the log from memory on a timer so you do not need to use refresh."
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
