import moment from "moment";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getAdjustedDateForTimeCutoff } from "../src/utils/diary";

describe("getAdjustedDateForTimeCutoff", () => {
	const standardCutoff = "04:00";

	test("returns previous day if before cutoff (03:59)", () => {
		const date = moment("2025-10-24T03:59:00");
		const result = getAdjustedDateForTimeCutoff(date, standardCutoff);
		assert.strictEqual(result.format("YYYY-MM-DD"), "2025-10-23");
	});

	test("returns same day if exactly at cutoff (04:00)", () => {
		const date = moment("2025-10-24T04:00:00");
		const result = getAdjustedDateForTimeCutoff(date, standardCutoff);
		assert.strictEqual(result.format("YYYY-MM-DD"), "2025-10-24");
	});

	test("minute boundary: 03:59 is previous diary day, 04:00 is current", () => {
		const before = getAdjustedDateForTimeCutoff(
			moment("2026-04-04T03:59:00"),
			"04:00"
		);
		const at = getAdjustedDateForTimeCutoff(
			moment("2026-04-04T04:00:00"),
			"04:00"
		);
		assert.strictEqual(before.format("YYYY-MM-DD"), "2026-04-03");
		assert.strictEqual(at.format("YYYY-MM-DD"), "2026-04-04");
	});

	test("default midnight cutoff: 00:00 message stays same calendar day", () => {
		const date = moment("2026-01-15T00:00:00");
		const result = getAdjustedDateForTimeCutoff(date, "00:00");
		assert.strictEqual(result.format("YYYY-MM-DD"), "2026-01-15");
	});

	test("hour-only cutoff string parses (single segment)", () => {
		const date = moment("2026-01-15T02:30:00");
		const result = getAdjustedDateForTimeCutoff(date, "3");
		assert.strictEqual(result.hour(), 2);
		assert.strictEqual(result.format("YYYY-MM-DD"), "2026-01-14");
	});
});
