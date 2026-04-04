import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildMultipartAudioBody } from "../src/bot/asr";

describe("buildMultipartAudioBody", () => {
	test("includes filename, model, and binary payload", () => {
		const boundary = "test_boundary_1";
		const encoder = new TextDecoder();
		const audio = new Uint8Array([1, 2, 3, 4]).buffer;
		const body = buildMultipartAudioBody(
			boundary,
			"clip.ogg",
			audio,
			"my-model"
		);
		const text = encoder.decode(body);
		assert.ok(text.includes(`--${boundary}`));
		assert.ok(text.includes('filename="clip.ogg"'));
		assert.ok(text.includes("my-model"));
		assert.ok(text.includes("\r\n"));
	});

	test("escapes double quotes in filename in header", () => {
		const boundary = "b";
		const body = buildMultipartAudioBody(
			boundary,
			'bad"name.ogg',
			new ArrayBuffer(0),
			"m"
		);
		const text = new TextDecoder().decode(body);
		assert.ok(!text.includes('filename="bad"name.ogg"'));
		assert.ok(text.includes('filename="badname.ogg"'));
	});
});
