import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JournalSettingTab } from "../src/settings-tab";

describe("JournalSettingTab.formatTokenMasked", () => {
	test("empty string", () => {
		assert.strictEqual(JournalSettingTab.formatTokenMasked(""), "");
		assert.strictEqual(JournalSettingTab.formatTokenMasked("   "), "");
	});

	test("shows full token when length is at most 6", () => {
		assert.strictEqual(JournalSettingTab.formatTokenMasked("12345"), "12345");
		assert.strictEqual(JournalSettingTab.formatTokenMasked("123456"), "123456");
	});

	test("shows first 6 characters and masks the rest with asterisks", () => {
		assert.strictEqual(
			JournalSettingTab.formatTokenMasked("1234567"),
			"123456*"
		);
		assert.strictEqual(
			JournalSettingTab.formatTokenMasked("abcdefghijklmnop"),
			"abcdef**********"
		);
	});
});
