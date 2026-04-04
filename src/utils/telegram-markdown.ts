import { escapers, serialiseWith } from "@telegraf/entity";
import type {
	Escaper,
	Message as EntityMessage,
	Node,
	Serialiser,
} from "@telegraf/entity/types/types";
import type { Message } from "grammy/types";
import type { JournalSettings } from "../settings/types";

const markdownSerialiser: Serialiser = (match: string, node?: Node) => {
	switch (node?.type) {
		case "bold":
			return `**${match}**`;
		case "italic":
			return `*${match}*`;
		case "underline":
			return `<u>${match}</u>`;
		case "strikethrough":
			return `~~${match}~~`;
		case "code":
			return `\`${match}\``;
		case "pre":
			if (node.language) {
				return "```" + node.language + "\n" + match + "\n```";
			}
			return "```\n" + match + "\n```";
		case "spoiler":
			return `==${match}==`;
		case "url":
			return match;
		case "text_link":
			return `[${match}](${node.url})`;
		case "text_mention":
			return `[${match}](tg://user?id=${node.user.id})`;
		case "blockquote":
			return `${match
				.split("\n")
				.map((line) => `>${line}`)
				.join("\n")}`;
		case "mention":
		case "custom_emoji":
		case "hashtag":
		case "cashtag":
		case "bot_command":
		case "phone_number":
		case "email":
		default:
			return match;
	}
};

const noEscaper: Escaper = (s) => s;

export type TelegramTextSettings = Pick<
	JournalSettings,
	"remove_formatting" | "markdown_escaper"
>;

/**
 * Text or caption as stored in the daily note: plain UTF-16 when removing
 * formatting, otherwise Telegram entities converted to Markdown-like markup,
 * optionally escaped for MarkdownV2-style safety (same as telegram-inbox).
 */
export function messageToObsidianText(
	msg: Message,
	settings: TelegramTextSettings
): string {
	if (settings.remove_formatting) {
		return msg.text ?? msg.caption ?? "";
	}
	if (!msg.text && !msg.caption) {
		return "";
	}
	const selectedEscaper = settings.markdown_escaper
		? escapers.MarkdownV2
		: noEscaper;
	return serialiseWith(markdownSerialiser, selectedEscaper)(
		msg as unknown as EntityMessage
	);
}
