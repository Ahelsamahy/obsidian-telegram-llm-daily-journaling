import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { appendMessage } from "../src/io";

describe("appendMessage", () => {
	test("appends message to empty content", () => {
		assert.strictEqual(appendMessage("", "New message"), "New message");
	});

	test("appends message to content without trailing newline", () => {
		assert.strictEqual(
			appendMessage("Existing content", "New message"),
			"Existing content\nNew message"
		);
	});

	test("appends message to content with trailing newline", () => {
		assert.strictEqual(
			appendMessage("Existing content\n", "New message"),
			"Existing content\nNew message"
		);
	});

	test("treats whitespace-only content as empty for trim branch", () => {
		assert.strictEqual(appendMessage("   \n\t  ", "New message"), "New message");
	});

	test("handles multiple lines of existing content", () => {
		assert.strictEqual(
			appendMessage("Line 1\nLine 2\nLine 3", "New message"),
			"Line 1\nLine 2\nLine 3\nNew message"
		);
	});
});
