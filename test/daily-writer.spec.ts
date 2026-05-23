import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Message } from "grammy/types";
import {
	buildMessageReceiptMarker,
	formatJournalBlock,
	hasMessageReceiptMarker,
} from "../src/bot/daily-writer";

describe("formatJournalBlock", () => {
	test("without timestamp heading: leading newline and trimmed body only", () => {
		assert.strictEqual(
			formatJournalBlock({ entry_timestamp_heading: false }, "  hello  ", 1_700_000_000),
			"\nhello\n"
		);
	});

	test("with timestamp heading: ### line then body", () => {
		const out = formatJournalBlock(
			{ entry_timestamp_heading: true },
			"line",
			1_700_000_000
		);
		assert.match(out, /\n### \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n\nline\n$/);
	});

	test("empty body yields single newline", () => {
		assert.strictEqual(
			formatJournalBlock({ entry_timestamp_heading: false }, "   ", 1),
			"\n"
		);
		assert.strictEqual(
			formatJournalBlock({ entry_timestamp_heading: true }, "", 1),
			"\n"
		);
	});

	test("builds a stable hidden receipt marker per Telegram message", () => {
		const msg = {
			message_id: 321,
			date: 1_700_000_000,
			chat: { id: 123_456_789, type: "private" },
		} as Message;
		assert.strictEqual(
			buildMessageReceiptMarker(msg),
			"%% tg-journal:chat=123456789;message=321 %%"
		);
	});

	test("detects an existing receipt marker in note content", () => {
		const msg = {
			message_id: 321,
			date: 1_700_000_000,
			chat: { id: 123_456_789, type: "private" },
		} as Message;
		const content = [
			"# Daily note",
			"",
			"something already written",
			"",
			"%% tg-journal:chat=123456789;message=321 %%",
		].join("\n");
		assert.strictEqual(hasMessageReceiptMarker(content, msg), true);
	});
});
