import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	messageToObsidianText,
	type TelegramTextSettings,
} from "../src/utils/telegram-markdown";
import type { Message } from "grammy/types";

const baseText: TelegramTextSettings = {
	remove_formatting: false,
	markdown_escaper: false,
};

function mockTextMessage(
	text: string | undefined,
	entities?: Message["entities"]
): Message {
	return {
		message_id: 1,
		from: {
			id: 1,
			is_bot: false,
			first_name: "T",
		},
		chat: { id: 1, type: "private" },
		date: 1_700_000_000,
		text,
		entities,
	} as Message;
}

describe("messageToObsidianText", () => {
	test("plain text when remove_formatting", () => {
		const msg = mockTextMessage("Hello **x**");
		assert.strictEqual(
			messageToObsidianText(msg, {
				remove_formatting: true,
				markdown_escaper: false,
			}),
			"Hello **x**"
		);
	});

	test("bold entities to Markdown when formatting on", () => {
		const msg = mockTextMessage("Hello bold world", [
			{ type: "bold", offset: 6, length: 4 },
		]);
		assert.strictEqual(
			messageToObsidianText(msg, baseText),
			"Hello **bold** world"
		);
	});

	test("empty when no text or caption and formatting on", () => {
		const msg = { ...mockTextMessage(""), text: undefined, caption: undefined };
		assert.strictEqual(messageToObsidianText(msg as Message, baseText), "");
	});
});
