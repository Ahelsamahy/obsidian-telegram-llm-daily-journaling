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
	/** Optional Hugging Face token (gated models / authenticated Hub API). Never logged. */
	hf_token: string;
	/** Cached model ids from last successful “Refresh from Hugging Face”. */
	asr_hf_model_ids_cache: string[];
	/** Epoch ms when `asr_hf_model_ids_cache` was last updated. */
	asr_hf_models_cache_epoch_ms: number;
	/** When true, diagnostics textarea refreshes periodically while settings are open */
	diagnostic_log_auto_refresh: boolean;
	/** Seconds between auto-refreshes (1–30) */
	diagnostic_log_auto_refresh_interval_sec: number;
	/** Dedupe Telegram retries (same update_id is ignored after a successful run) */
	last_processed_update_id: number;
	/** Last time a journal line was written (ms since epoch); for /last */
	last_journal_saved_epoch_ms: number;
	/** Blockquote line “Re: …” when replying to another message */
	include_reply_context: boolean;
	/** When set, only download media on Wi‑Fi / ethernet if the browser reports it */
	download_media_wifi_only: boolean;
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
	asr_model: "Qwen/Qwen3-ASR-1.7B",
	hf_token: "",
	asr_hf_model_ids_cache: [],
	asr_hf_models_cache_epoch_ms: 0,
	diagnostic_log_auto_refresh: true,
	diagnostic_log_auto_refresh_interval_sec: 2,
	last_processed_update_id: 0,
	last_journal_saved_epoch_ms: 0,
	include_reply_context: true,
	download_media_wifi_only: false,
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
	refreshAsrModelsFromHuggingFace(): Promise<{
		ok: boolean;
		count: number;
		error?: string;
	}>;
}
