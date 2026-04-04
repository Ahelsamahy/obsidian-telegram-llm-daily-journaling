import type { JournalSettings } from "../settings/types";

const ALLOWED_CHAT_TYPES = ["private", "channel", "supergroup"] as const;

export function isAllowedChatType(
	type: string
): type is (typeof ALLOWED_CHAT_TYPES)[number] {
	return ALLOWED_CHAT_TYPES.includes(type as (typeof ALLOWED_CHAT_TYPES)[number]);
}

export function isAuthorizedUser(
	settings: JournalSettings,
	userId: number | undefined,
	username: string | undefined
): boolean {
	if (username && settings.allow_users.includes(username)) {
		return true;
	}
	if (userId && settings.allow_users.includes(userId.toString())) {
		return true;
	}
	return false;
}
