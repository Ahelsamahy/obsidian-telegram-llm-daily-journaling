import { Composer, type Context } from "grammy";
import type { JournalSettings } from "../settings/types";
import { isAllowedChatType, isAuthorizedUser } from "./authorization";

export function createRestrictToAllowedUsersMiddleware(
	settings: JournalSettings
): Composer<Context> {
	return new Composer().use(async (ctx: Context, next) => {
		const chat = ctx.chat;

		if (!chat || !isAllowedChatType(chat.type)) {
			console.debug("Unauthorized chat type:", chat?.type, chat?.id);
			return;
		}

		const userId = chat.id;
		const username = chat.username;

		if (isAuthorizedUser(settings, userId, username)) {
			await next();
		} else {
			console.debug(
				`Unauthorized access attempt: User ${String(username ?? userId)} at ${new Date().toISOString()}`
			);
		}
	});
}

export function createRecordUpdateIdMiddleware(
	updateIdCallback: (updateId: number) => void
): Composer<Context> {
	return new Composer().use(async (ctx: Context, next) => {
		const updateId = ctx.update?.update_id;
		if (updateId) {
			updateIdCallback(updateId);
		}
		await next();
	});
}
