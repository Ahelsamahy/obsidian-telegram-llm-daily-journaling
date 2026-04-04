export type ActionAfterReception = "none" | "reaction" | "delete";

export interface JournalSettings {
	token: string;
	allow_users: string[];
	disable_auto_reception: boolean;
	daily_note_time_cutoff: string;
	action_after_reception: ActionAfterReception;
	reaction_emoji: string;
	transcription_enabled: boolean;
	asr_base_url: string;
	asr_api_key: string;
	asr_model: string;
}

export const DEFAULT_SETTINGS: JournalSettings = {
	token: "",
	allow_users: [],
	disable_auto_reception: false,
	daily_note_time_cutoff: "00:00",
	action_after_reception: "reaction",
	reaction_emoji: "❤",
	transcription_enabled: false,
	asr_base_url: "http://127.0.0.1:8765/v1",
	asr_api_key: "",
	asr_model: "Qwen/Qwen3-ASR-0.6B",
};

export interface JournalPluginApi {
	settings: JournalSettings;
	saveSettings(): Promise<void>;
	initBot(): Promise<void>;
	startBot(): void;
	stopBot(): Promise<void>;
	getUpdates(): Promise<void>;
}
