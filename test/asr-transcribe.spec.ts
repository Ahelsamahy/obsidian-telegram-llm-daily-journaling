import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RequestUrlResponse } from "obsidian";
import { transcribeWithLocalAsr } from "../src/bot/asr";
import type { JournalSettings } from "../src/settings/types";

function mockResponse(
	status: number,
	json: unknown,
	text = ""
): RequestUrlResponse {
	return {
		status,
		headers: {},
		arrayBuffer: new ArrayBuffer(0),
		json,
		text,
	};
}

function baseSettings(overrides: Partial<JournalSettings>): JournalSettings {
	return {
		token: "",
		allow_users: [],
		disable_auto_reception: false,
		daily_note_time_cutoff: "00:00",
		action_after_reception: "none",
		reaction_emoji: "❤",
		transcription_enabled: true,
		asr_base_url: "http://127.0.0.1:8765/v1",
		asr_api_key: "",
		asr_model: "test-model",
		...overrides,
	};
}

describe("transcribeWithLocalAsr", () => {
	test("throws when transcription is disabled", async () => {
		const s = baseSettings({ transcription_enabled: false });
		await assert.rejects(
			() =>
				transcribeWithLocalAsr(s, new ArrayBuffer(0), "a.ogg", async () => {
					throw new Error("should not call request");
				}),
			/Transcription is disabled/
		);
	});

	test("POSTs to base URL /audio/transcriptions and returns text", async () => {
		const s = baseSettings({});
		const out = await transcribeWithLocalAsr(
			s,
			new Uint8Array([9, 9]).buffer,
			"clip.ogg",
			async (param) => {
				const p = param as {
					url: string;
					method: string;
					headers: Record<string, string>;
				};
				assert.strictEqual(p.url, "http://127.0.0.1:8765/v1/audio/transcriptions");
				assert.strictEqual(p.method, "POST");
				assert.ok(p.headers["Content-Type"]?.includes("multipart/form-data"));
				return mockResponse(200, { text: "hello world" });
			}
		);
		assert.strictEqual(out, "hello world");
	});

	test("throws on non-2xx response", async () => {
		const s = baseSettings({});
		await assert.rejects(
			() =>
				transcribeWithLocalAsr(s, new ArrayBuffer(0), "a.ogg", async () =>
					Promise.resolve(mockResponse(503, {}, "unavailable"))
				),
			/ASR HTTP 503/
		);
	});

	test("throws when JSON has no text", async () => {
		const s = baseSettings({});
		await assert.rejects(
			() =>
				transcribeWithLocalAsr(s, new ArrayBuffer(0), "a.ogg", async () =>
					Promise.resolve(mockResponse(200, {}))
				),
			/missing text/
		);
	});

	test("sends Authorization when asr_api_key is set", async () => {
		const s = baseSettings({ asr_api_key: "secret" });
		await transcribeWithLocalAsr(
			s,
			new ArrayBuffer(0),
			"a.ogg",
			async (param) => {
				const p = param as { headers: Record<string, string> };
				assert.strictEqual(p.headers.Authorization, "Bearer secret");
				return mockResponse(200, { text: "ok" });
			}
		);
	});
});
