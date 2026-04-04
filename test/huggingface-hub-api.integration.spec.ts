import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { HF_ASR_MODELS_API_URL } from "../src/utils/huggingface-asr-models";

/**
 * Ensures the Hub endpoint used by the plugin is reachable and returns JSON (same as Obsidian requestUrl target).
 * Skips when HF_API_INTEGRATION=0 (offline / flaky-network CI).
 */
describe("Hugging Face ASR models API (integration)", () => {
	test("GET returns 200 and a JSON array", async (t) => {
		if (process.env.HF_API_INTEGRATION === "0") {
			t.skip("HF_API_INTEGRATION=0 (e.g. CI without outbound Hub)");
			return;
		}
		const res = await fetch(HF_ASR_MODELS_API_URL, {
			headers: { Accept: "application/json" },
		});
		assert.strictEqual(res.status, 200, "Hub ASR models API should return 200");
		const data: unknown = await res.json();
		assert.ok(Array.isArray(data), "response body should be a JSON array");
		assert.ok(
			(data as unknown[]).length > 0,
			"response should list at least one model"
		);
	});
});
