import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Context } from "grammy";
import type { File } from "grammy/types";
import {
	assertFileSizeForBotDownload,
	TELEGRAM_BOT_MAX_FILE_BYTES,
} from "../src/bot/handlers";

function mockCtx(): Context {
	const replies: string[] = [];
	return {
		reply: (text: string) => {
			replies.push(text);
			return Promise.resolve({} as never);
		},
		_replies: replies,
	} as Context & { _replies: string[] };
}

function fileWithSize(bytes: number | undefined): File {
	return {
		file_id: "abc",
		file_size: bytes,
	} as File;
}

describe("assertFileSizeForBotDownload", () => {
	test("allows when file_size is undefined", () => {
		const logs: string[] = [];
		const ok = assertFileSizeForBotDownload(
			fileWithSize(undefined),
			mockCtx(),
			(m) => {
				logs.push(m);
			}
		);
		assert.strictEqual(ok, true);
		assert.strictEqual(logs.length, 0);
	});

	test("allows at exact limit", () => {
		const ok = assertFileSizeForBotDownload(
			fileWithSize(TELEGRAM_BOT_MAX_FILE_BYTES),
			mockCtx(),
			() => {}
		);
		assert.strictEqual(ok, true);
	});

	test("rejects over 20 MB", () => {
		const ctx = mockCtx();
		const logs: string[] = [];
		const ok = assertFileSizeForBotDownload(
			fileWithSize(TELEGRAM_BOT_MAX_FILE_BYTES + 1),
			ctx,
			(m) => {
				logs.push(m);
			}
		);
		assert.strictEqual(ok, false);
		assert.ok(logs.some((l) => l.includes("20 MB")));
		assert.ok(logs.some((l) => l.includes("file_id")));
		const replies = (ctx as { _replies: string[] })._replies;
		assert.ok(replies[0]?.includes("20 MB"));
	});
});
