import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../src/settings/types";

describe("DEFAULT_SETTINGS", () => {
	test("has stable defaults for journaling and ASR", () => {
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
		assert.strictEqual(DEFAULT_SETTINGS.diagnostic_log_auto_refresh, true);
		assert.strictEqual(
			DEFAULT_SETTINGS.diagnostic_log_auto_refresh_interval_sec,
			2
		);
	});
});
