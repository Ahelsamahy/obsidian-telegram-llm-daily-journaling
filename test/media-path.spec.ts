import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDeterministicMediaFilename } from "../src/bot/media-filename";
import { buildVaultMediaPath } from "../src/utils/media-path";

describe("formatDeterministicMediaFilename", () => {
	test("uses date, chat id, message id, and file unique id", () => {
		const name = formatDeterministicMediaFilename({
			messageDateUnix: 1_747_991_412,
			chatId: 710921552,
			messageId: 124,
			fileUniqueId: "AbCdEf",
			extension: "jpg",
		});
		assert.match(
			name,
			/^\d{8}-\d{6}-chat710921552-msg124-fileAbCdEf\.jpg$/
		);
	});
});

describe("buildVaultMediaPath", () => {
	test("stores media under the same month folder as the note", () => {
		const path = buildVaultMediaPath({
			noteFile: {
				parent: { path: "Journaling/2026/05" },
			} as never,
			mediaSubfolderName: "telegram-media",
			messageDateUnix: 1_747_991_412,
			chatId: 710921552,
			messageId: 124,
			fileUniqueId: "AbCdEf",
			extension: "jpg",
		});
		assert.match(
			path,
			/^Journaling\/2026\/05\/telegram-media\/\d{8}-\d{6}-chat710921552-msg124-fileAbCdEf\.jpg$/
		);
	});
});
