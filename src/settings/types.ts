export type ActionAfterReception = "none" | "reaction" | "delete";

import type {
	CaptureMode,
	LocalImportJob,
} from "../remote/types";

export interface JournalSettings {
	capture_mode: CaptureMode;
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
	/** Folder path under vault root (legacy embedded mode path) */
	download_dir: string;
	/** Folder name under the daily note month folder for synced remote media */
	media_subfolder_name: string;
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
	/** Legacy dedupe state kept for migration compatibility */
	last_processed_update_id: number;
	/** Highest Telegram update seen in embedded mode */
	last_seen_update_id: number;
	/** Highest Telegram update committed to the vault in embedded mode */
	last_committed_update_id: number;
	/** Last time a journal line was written (ms since epoch); for /last */
	last_journal_saved_epoch_ms: number;
	/** Blockquote line “Re: …” when replying to another message */
	include_reply_context: boolean;
	/** When set, only download media on Wi‑Fi / ethernet if the browser reports it */
	download_media_wifi_only: boolean;
	receiver_base_url: string;
	receiver_api_token: string;
	receiver_sync_on_startup: boolean;
	receiver_sync_interval_sec: number;
	receiver_batch_size: number;
	receiver_health_timeout_ms: number;
	last_receiver_cursor: number;
	local_import_jobs: LocalImportJob[];
}

export const DEFAULT_SETTINGS: JournalSettings = {
	capture_mode: "embedded_bot",
	token: "",
	allow_users: [],
	disable_auto_reception: false,
	daily_note_time_cutoff: "00:00",
	entry_timestamp_heading: false,
	remove_formatting: true,
	markdown_escaper: false,
	download_media: false,
	download_dir: "assets/telegram",
	media_subfolder_name: "telegram-media",
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
	last_seen_update_id: 0,
	last_committed_update_id: 0,
	last_journal_saved_epoch_ms: 0,
	include_reply_context: true,
	download_media_wifi_only: false,
	receiver_base_url: "",
	receiver_api_token: "",
	receiver_sync_on_startup: true,
	receiver_sync_interval_sec: 30,
	receiver_batch_size: 20,
	receiver_health_timeout_ms: 8000,
	last_receiver_cursor: 0,
	local_import_jobs: [],
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
	syncRemoteNow(): Promise<void>;
	runHealthCheck(): Promise<string[]>;
	getFailedImportJobs(): LocalImportJob[];
	retryFailedJobs(eventId?: string): Promise<void>;
}
