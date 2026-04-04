import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Message } from "grammy/types";
import {
	getReplyPreviewLine,
	prefixBodyWithReplyContext,
} from "../src/utils/reply-context";

describe("reply context", () => {
	test("prefix adds blockquote when enabled and reply exists", () => {
		const replyTo = {
			message_id: 1,
			date: 1,
			chat: { id: 1, type: "private" },
			text: "original line one\nline two",
		} as Message;
		const msg = {
			message_id: 2,
			date: 2,
			chat: { id: 1, type: "private" },
			text: "reply body",
			reply_to_message: replyTo,
		} as Message;
		const out = prefixBodyWithReplyContext("reply body", msg, {
			include_reply_context: true,
		});
		assert.strictEqual(
			out,
			"> Re: original line one\n\nreply body"
		);
	});

	test("getReplyPreviewLine truncates long first line", () => {
		const long = "a".repeat(200);
		const replyTo = {
			message_id: 1,
			date: 1,
			chat: { id: 1, type: "private" },
			text: long,
		} as Message;
		const prev = getReplyPreviewLine(replyTo, 50);
		assert.strictEqual(prev.length, 51);
		assert.ok(prev.endsWith("…"));
	});

	test("prefix unchanged when setting off", () => {
		const msg = {
			message_id: 2,
			reply_to_message: { message_id: 1, text: "x" },
		} as Message;
		assert.strictEqual(
			prefixBodyWithReplyContext("only", msg, {
				include_reply_context: false,
			}),
			"only"
		);
	});
});
