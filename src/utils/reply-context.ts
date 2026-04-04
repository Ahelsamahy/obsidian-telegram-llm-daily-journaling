import type { Message } from "grammy/types";
import type { JournalSettings } from "../settings/types";

const DEFAULT_MAX_PREVIEW = 160;

/** One-line preview of the message being replied to (for journaling context). */
export function getReplyPreviewLine(
	replyTo: Message,
	maxLen = DEFAULT_MAX_PREVIEW
): string {
	const text = replyTo.text ?? replyTo.caption ?? "";
	const trimmed = text.trim();
	if (trimmed !== "") {
		const firstLine = trimmed.split("\n")[0] ?? trimmed;
		return firstLine.length > maxLen
			? `${firstLine.slice(0, maxLen)}…`
			: firstLine;
	}
	if (replyTo.photo?.length) {
		return "[photo]";
	}
	if (replyTo.video) {
		return "[video]";
	}
	if (replyTo.animation) {
		return "[animation]";
	}
	if (replyTo.voice) {
		return "[voice]";
	}
	if (replyTo.audio) {
		return "[audio]";
	}
	if (replyTo.document) {
		return "[document]";
	}
	if (replyTo.sticker) {
		return "[sticker]";
	}
	if (replyTo.video_note) {
		return "[video message]";
	}
	return "[message]";
}

/** Prefix body with a blockquote line so replies read as a thread in the note. */
export function prefixBodyWithReplyContext(
	body: string,
	msg: Message,
	settings: Pick<JournalSettings, "include_reply_context">
): string {
	if (!settings.include_reply_context || !msg.reply_to_message) {
		return body;
	}
	const preview = getReplyPreviewLine(msg.reply_to_message);
	return `> Re: ${preview}\n\n${body}`;
}
