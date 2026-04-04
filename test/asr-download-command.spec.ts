import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JournalSettingTab } from "../src/settings-tab";

describe("JournalSettingTab.formatAsrDownloadCommand", () => {
	test("uses default model when empty", () => {
		const c = JournalSettingTab.formatAsrDownloadCommand("");
		assert.ok(c.includes("Qwen/Qwen3-ASR-1.7B"));
		assert.ok(c.includes("npm run asr:download-model"));
	});

	test("escapes double quotes in model id for shell", () => {
		const c = JournalSettingTab.formatAsrDownloadCommand('x/"y');
		assert.ok(c.includes('\\"'));
	});
});
