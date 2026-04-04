import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	CURATED_ASR_MODEL_IDS,
	mergeAsrModelPickerIds,
	parseAndSortAsrModelIdsFromHubJson,
} from "../src/utils/huggingface-asr-models";

describe("mergeAsrModelPickerIds", () => {
	test("puts curated first then sorted extras", () => {
		const merged = mergeAsrModelPickerIds(["zoo/a", "Qwen/Qwen3-ASR-1.7B"]);
		assert.ok(merged[0] === CURATED_ASR_MODEL_IDS[0]);
		assert.ok(merged.includes("zoo/a"));
		const idxZoo = merged.indexOf("zoo/a");
		const idxCuratedEnd = CURATED_ASR_MODEL_IDS.length - 1;
		assert.ok(idxZoo > idxCuratedEnd);
	});

	test("dedupes cache against curated", () => {
		const q = CURATED_ASR_MODEL_IDS[0];
		const merged = mergeAsrModelPickerIds([q, "other/x"]);
		assert.strictEqual(merged.filter((id) => id === q).length, 1);
	});
});

describe("parseAndSortAsrModelIdsFromHubJson", () => {
	test("extracts ids and prefers higher trendingScore", () => {
		const rows = [
			{ id: "a/low", trendingScore: 1, likes: 0, downloads: 0 },
			{ id: "b/high", trendingScore: 99, likes: 0, downloads: 0 },
		];
		const ids = parseAndSortAsrModelIdsFromHubJson(rows);
		assert.deepStrictEqual(ids, ["b/high", "a/low"]);
	});

	test("ignores invalid rows", () => {
		const rows = [{ id: "n-slash" }, {}, { modelId: "ok/fine" }];
		const ids = parseAndSortAsrModelIdsFromHubJson(rows);
		assert.deepStrictEqual(ids, ["ok/fine"]);
	});
});
