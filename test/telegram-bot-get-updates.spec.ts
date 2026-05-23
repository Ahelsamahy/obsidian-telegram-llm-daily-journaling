import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TelegramJournalBot } from "../src/bot/telegram-bot";
import { DEFAULT_SETTINGS } from "../src/settings/types";

describe("TelegramJournalBot.getUpdates", () => {
	test("drains all pending update batches in one call", async () => {
		const bot = new TelegramJournalBot(
			{
				process: async () => "",
			} as never,
			{
				...DEFAULT_SETTINGS,
				token: "test-token",
				allow_users: ["1"],
			},
			{
				getLastProcessedUpdateId: () => 0,
				persistProcessedUpdateId: async () => {},
			}
		);

		const offsetsSeen: number[] = [];
		const confirmOffsets: number[] = [];
		const handled: number[] = [];
		const queued = [
			[{ update_id: 1 }, { update_id: 2 }],
			[{ update_id: 3 }],
			[],
		];
		let batchIndex = 0;

		bot.bot.api.getUpdates = (async ({ offset, limit }) => {
			assert.ok(typeof offset === "number");
			if (limit === 1) {
				confirmOffsets.push(offset);
				return [];
			}
			offsetsSeen.push(offset);
			return queued[batchIndex++] as never;
		}) as typeof bot.bot.api.getUpdates;

		bot.bot.handleUpdate = (async (update) => {
			handled.push(update.update_id);
			bot.update_id = update.update_id;
		}) as typeof bot.bot.handleUpdate;

		await bot.getUpdates();

		assert.deepStrictEqual(offsetsSeen, [1, 3, 4]);
		assert.deepStrictEqual(confirmOffsets, [3, 4]);
		assert.deepStrictEqual(handled, [1, 2, 3]);
	});
});
