import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatJournalBlock } from "../src/bot/daily-writer";

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
});
