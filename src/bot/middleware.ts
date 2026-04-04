import { Composer, type Context } from "grammy";
import type { JournalSettings } from "../settings/types";
import { isAllowedChatType, isAuthorizedUser } from "./authorization";

export type HandlerLog = (message: string) => void;

/** Skip updates whose update_id was already processed successfully (Telegram retries). */
export function createIdempotentUpdateMiddleware(
	getLastProcessedUpdateId: () => number,
	persistProcessedUpdateId: (updateId: number) => void | Promise<void>,
	log: HandlerLog
): Composer<Context> {
	return new Composer().use(async (ctx: Context, next) => {
		const id = ctx.update.update_id;
		if (id <= getLastProcessedUpdateId()) {
			log(`Skip duplicate update_id=${String(id)} (already processed).`);
			return;
		}
		await next();
		await persistProcessedUpdateId(id);
	});
}

export function createRestrictToAllowedUsersMiddleware(
	settings: JournalSettings,
	log?: (message: string) => void
): Composer<Context> {
	const write = log ?? (() => {});
	return new Composer().use(async (ctx: Context, next) => {
		const chat = ctx.chat;

		if (!chat || !isAllowedChatType(chat.type)) {
			write(
				`Blocked: chat type "${String(chat?.type)}" (id ${String(chat?.id)})`
			);
			return;
		}

		// Prefer sender id (correct in groups/supergroups); private chat falls back to chat.id.
		const userId = ctx.from?.id ?? chat.id;
		const username = ctx.from?.username ?? chat.username;

		if (isAuthorizedUser(settings, userId, username)) {
			await next();
		} else {
			write(
				`Blocked: user id ${String(userId)} @${String(username ?? "n/a")} not in allowed list (chat ${chat.type} ${String(chat.id)})`
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
