export type ActionAfterReception = "none" | "reaction" | "delete";

export interface JournalSettings {
	token: string;
	allow_users: string[];
	disable_auto_reception: boolean;
	daily_note_time_cutoff: string;
	/** When true, each appended entry starts with a ### heading of the message time (YYYY-MM-DD HH:mm). */
	entry_timestamp_heading: boolean;
	/** Plain text only; no Telegram entity → Markdown conversion */
	remove_formatting: boolean;
	/** When converting entities to Markdown, escape for MarkdownV2-style safety */
	markdown_escaper: boolean;
	/** Save photos, videos, documents, etc. into the vault */
	download_media: boolean;
	/** Folder path under vault root (e.g. assets/telegram) */
	download_dir: string;
	action_after_reception: ActionAfterReception;
	reaction_emoji: string;
	transcription_enabled: boolean;
	asr_base_url: string;
	asr_api_key: string;
	asr_model: string;
	/** When true, diagnostics textarea refreshes periodically while settings are open */
	diagnostic_log_auto_refresh: boolean;
	/** Seconds between auto-refreshes (1–30) */
	diagnostic_log_auto_refresh_interval_sec: number;
}

export const DEFAULT_SETTINGS: JournalSettings = {
	token: "",
	allow_users: [],
	disable_auto_reception: false,
	daily_note_time_cutoff: "00:00",
	entry_timestamp_heading: false,
	remove_formatting: true,
	markdown_escaper: false,
	download_media: false,
	download_dir: "assets/telegram",
	action_after_reception: "reaction",
	reaction_emoji: "❤",
	transcription_enabled: false,
	asr_base_url: "http://127.0.0.1:8765/v1",
	asr_api_key: "",
	asr_model: "Qwen/Qwen3-ASR-0.6B",
	diagnostic_log_auto_refresh: true,
	diagnostic_log_auto_refresh_interval_sec: 2,
};

export interface JournalPluginApi {
	settings: JournalSettings;
	saveSettings(): Promise<void>;
	initBot(): Promise<void>;
	startBot(): void;
	stopBot(): Promise<void>;
	getUpdates(): Promise<void>;
	appendDiagnosticLog(message: string): void;
	getDiagnosticLogText(): string;
	clearDiagnosticLog(): void;
}
