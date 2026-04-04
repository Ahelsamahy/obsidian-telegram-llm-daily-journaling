import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Message } from "grammy/types";
import { isAudioLikeDocument } from "../src/bot/handlers";

function docMsg(partial: Partial<Message["document"]>): Message {
	return {
		message_id: 1,
		date: 0,
		chat: { id: 1, type: "private" },
		document: partial as Message["document"],
	} as Message;
}

describe("isAudioLikeDocument", () => {
	test("false when no document", () => {
		assert.strictEqual(
			isAudioLikeDocument({
				message_id: 1,
				date: 0,
				chat: { id: 1, type: "private" },
			} as Message),
			false
		);
	});

	test("true for audio mime", () => {
		assert.strictEqual(
			isAudioLikeDocument(
				docMsg({
					file_id: "x",
					file_unique_id: "y",
					mime_type: "audio/mpeg",
				})
			),
			true
		);
	});

	test("true for common extensions", () => {
		assert.strictEqual(
			isAudioLikeDocument(
				docMsg({
					file_id: "x",
					file_unique_id: "y",
					file_name: "clip.m4a",
				})
			),
			true
		);
	});

	test("false for pdf", () => {
		assert.strictEqual(
			isAudioLikeDocument(
				docMsg({
					file_id: "x",
					file_unique_id: "y",
					mime_type: "application/pdf",
					file_name: "x.pdf",
				})
			),
			false
		);
	});
});
