import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	isAllowedChatType,
	isAuthorizedUser,
} from "../src/bot/authorization";
import type { JournalSettings } from "../src/settings/types";

function settings(overrides: Partial<JournalSettings>): JournalSettings {
	return {
		token: "",
		allow_users: [],
		disable_auto_reception: false,
		daily_note_time_cutoff: "00:00",
		action_after_reception: "none",
		reaction_emoji: "❤",
		transcription_enabled: false,
		asr_base_url: "",
		asr_api_key: "",
		asr_model: "m",
		...overrides,
	};
}

describe("isAllowedChatType", () => {
	test("allows private, channel, supergroup", () => {
		assert.strictEqual(isAllowedChatType("private"), true);
		assert.strictEqual(isAllowedChatType("channel"), true);
		assert.strictEqual(isAllowedChatType("supergroup"), true);
	});

	test("rejects other types", () => {
		assert.strictEqual(isAllowedChatType("group"), false);
		assert.strictEqual(isAllowedChatType("bot"), false);
	});
});

describe("isAuthorizedUser", () => {
	test("matches numeric user id in allow list", () => {
		const s = settings({ allow_users: ["12345", "other"] });
		assert.strictEqual(isAuthorizedUser(s, 12345, undefined), true);
	});

	test("matches username without @", () => {
		const s = settings({ allow_users: ["alice"] });
		assert.strictEqual(isAuthorizedUser(s, 1, "alice"), true);
	});

	test("rejects when neither id nor username matches", () => {
		const s = settings({ allow_users: ["999"] });
		assert.strictEqual(isAuthorizedUser(s, 123, "bob"), false);
	});

	test("username match takes precedence when both provided", () => {
		const s = settings({ allow_users: ["allowed"] });
		assert.strictEqual(isAuthorizedUser(s, 999, "allowed"), true);
	});
});
