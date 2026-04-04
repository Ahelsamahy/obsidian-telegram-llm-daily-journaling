import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pickAudioFilename } from "../src/bot/handlers";

describe("pickAudioFilename", () => {
	test("uses last path segment", () => {
		assert.strictEqual(
			pickAudioFilename("voice/file_123.ogg"),
			"file_123.ogg"
		);
	});

	test("adds .ogg when segment has no extension", () => {
		assert.strictEqual(pickAudioFilename("voice/file_123"), "file_123.ogg");
	});

	test("handles bare filename", () => {
		assert.strictEqual(pickAudioFilename("x.webm"), "x.webm");
	});
});
