import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../src/settings/types";

describe("DEFAULT_SETTINGS", () => {
	test("has stable defaults for journaling and ASR", () => {
		assert.strictEqual(DEFAULT_SETTINGS.capture_mode, "embedded_bot");
		assert.strictEqual(DEFAULT_SETTINGS.daily_note_time_cutoff, "00:00");
		assert.strictEqual(DEFAULT_SETTINGS.transcription_enabled, false);
		assert.strictEqual(
			DEFAULT_SETTINGS.asr_base_url,
			"http://127.0.0.1:8765/v1"
		);
		assert.strictEqual(DEFAULT_SETTINGS.disable_auto_reception, false);
		assert.strictEqual(DEFAULT_SETTINGS.entry_timestamp_heading, false);
		assert.strictEqual(DEFAULT_SETTINGS.remove_formatting, true);
		assert.strictEqual(DEFAULT_SETTINGS.markdown_escaper, false);
		assert.strictEqual(DEFAULT_SETTINGS.download_media, false);
		assert.strictEqual(DEFAULT_SETTINGS.download_dir, "assets/telegram");
		assert.strictEqual(
			DEFAULT_SETTINGS.media_subfolder_name,
			"telegram-media"
		);
		assert.strictEqual(DEFAULT_SETTINGS.last_processed_update_id, 0);
		assert.strictEqual(DEFAULT_SETTINGS.last_seen_update_id, 0);
		assert.strictEqual(DEFAULT_SETTINGS.last_committed_update_id, 0);
		assert.strictEqual(DEFAULT_SETTINGS.last_journal_saved_epoch_ms, 0);
		assert.strictEqual(DEFAULT_SETTINGS.include_reply_context, true);
		assert.strictEqual(DEFAULT_SETTINGS.download_media_wifi_only, false);
		assert.strictEqual(DEFAULT_SETTINGS.diagnostic_log_auto_refresh, true);
		assert.strictEqual(
			DEFAULT_SETTINGS.diagnostic_log_auto_refresh_interval_sec,
			2
		);
		assert.strictEqual(DEFAULT_SETTINGS.hf_token, "");
		assert.deepStrictEqual(DEFAULT_SETTINGS.asr_hf_model_ids_cache, []);
		assert.strictEqual(DEFAULT_SETTINGS.asr_hf_models_cache_epoch_ms, 0);
		assert.strictEqual(DEFAULT_SETTINGS.receiver_base_url, "");
		assert.strictEqual(DEFAULT_SETTINGS.receiver_api_token, "");
		assert.strictEqual(DEFAULT_SETTINGS.receiver_sync_on_startup, true);
		assert.strictEqual(DEFAULT_SETTINGS.receiver_sync_interval_sec, 30);
		assert.strictEqual(DEFAULT_SETTINGS.receiver_batch_size, 20);
		assert.strictEqual(DEFAULT_SETTINGS.receiver_health_timeout_ms, 8000);
		assert.strictEqual(DEFAULT_SETTINGS.last_receiver_cursor, 0);
		assert.deepStrictEqual(DEFAULT_SETTINGS.local_import_jobs, []);
	});
});
