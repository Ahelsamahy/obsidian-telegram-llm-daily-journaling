import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	isValidDailyCutoff,
	isValidMediaSubfolderName,
	normalizeAllowedUsersInput,
} from "../src/settings/validation";

describe("settings validation", () => {
	test("normalizes allowed users by trimming, stripping @, and deduping", () => {
		assert.deepStrictEqual(
			normalizeAllowedUsersInput([" @alice ", "710", "alice", "", "@710"]),
			["alice", "710"]
		);
	});

	test("accepts strict HH:MM cutoff", () => {
		assert.strictEqual(isValidDailyCutoff("00:00"), true);
		assert.strictEqual(isValidDailyCutoff("23:59"), true);
		assert.strictEqual(isValidDailyCutoff("4:00"), false);
		assert.strictEqual(isValidDailyCutoff("25:00"), false);
	});

	test("rejects unsafe media subfolder names", () => {
		assert.strictEqual(isValidMediaSubfolderName("telegram-media"), true);
		assert.strictEqual(isValidMediaSubfolderName("../escape"), false);
		assert.strictEqual(isValidMediaSubfolderName("folder/name"), false);
	});
});
