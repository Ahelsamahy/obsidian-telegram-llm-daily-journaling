#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import Database from "better-sqlite3";

const PORT = Number(process.env.RECEIVER_PORT || 8787);
const HOST = process.env.RECEIVER_HOST || "0.0.0.0";
const DATA_DIR = process.env.RECEIVER_DATA_DIR || "./companion-data";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API_TOKEN = process.env.RECEIVER_API_TOKEN || "";
const ALLOWED_USERS = new Set(
	(process.env.RECEIVER_ALLOWED_USERS || "")
		.split(",")
		.map((value) => value.trim().replace(/^@+/, ""))
		.filter(Boolean)
);

if (!BOT_TOKEN) {
	throw new Error("TELEGRAM_BOT_TOKEN is required.");
}
if (!API_TOKEN) {
	throw new Error("RECEIVER_API_TOKEN is required.");
}

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(join(DATA_DIR, "assets"), { recursive: true });

const db = new Database(join(DATA_DIR, "receiver.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS assets (
	asset_id TEXT PRIMARY KEY,
	remote_key TEXT NOT NULL UNIQUE,
	filename TEXT NOT NULL,
	stored_path TEXT NOT NULL,
	mime_type TEXT NOT NULL,
	size_bytes INTEGER NOT NULL,
	file_unique_id TEXT NOT NULL,
	extension TEXT NOT NULL,
	sha256 TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
	cursor INTEGER PRIMARY KEY AUTOINCREMENT,
	event_id TEXT NOT NULL UNIQUE,
	update_id INTEGER NOT NULL UNIQUE,
	chat_id INTEGER NOT NULL,
	message_id INTEGER NOT NULL,
	message_date_unix INTEGER NOT NULL,
	kind TEXT NOT NULL,
	state TEXT NOT NULL,
	message_json TEXT NOT NULL,
	asset_id TEXT,
	last_error TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
);
`);

const insertEventStmt = db.prepare(`
INSERT INTO events (
	event_id, update_id, chat_id, message_id, message_date_unix, kind, state,
	message_json, asset_id, created_at, updated_at
) VALUES (
	@event_id, @update_id, @chat_id, @message_id, @message_date_unix, @kind, @state,
	@message_json, @asset_id, @created_at, @updated_at
)
ON CONFLICT(event_id) DO NOTHING
`);

const updateEventStmt = db.prepare(`
UPDATE events
SET state = @state, asset_id = COALESCE(@asset_id, asset_id), last_error = @last_error, updated_at = @updated_at
WHERE event_id = @event_id
`);

const upsertAssetStmt = db.prepare(`
INSERT INTO assets (
	asset_id, remote_key, filename, stored_path, mime_type, size_bytes,
	file_unique_id, extension, sha256, created_at
) VALUES (
	@asset_id, @remote_key, @filename, @stored_path, @mime_type, @size_bytes,
	@file_unique_id, @extension, @sha256, @created_at
)
ON CONFLICT(asset_id) DO UPDATE SET
	remote_key = excluded.remote_key,
	filename = excluded.filename,
	stored_path = excluded.stored_path,
	mime_type = excluded.mime_type,
	size_bytes = excluded.size_bytes,
	file_unique_id = excluded.file_unique_id,
	extension = excluded.extension,
	sha256 = excluded.sha256
`);

const getAssetStmt = db.prepare(
	"SELECT * FROM assets WHERE asset_id = ?"
);

const listEventsStmt = db.prepare(`
SELECT
	e.cursor,
	e.event_id,
	e.update_id,
	e.chat_id,
	e.message_id,
	e.message_date_unix,
	e.kind,
	e.state,
	e.message_json,
	a.asset_id,
	a.remote_key,
	a.filename,
	a.mime_type,
	a.size_bytes,
	a.file_unique_id,
	a.extension,
	a.sha256
FROM events e
LEFT JOIN assets a ON a.asset_id = e.asset_id
WHERE e.cursor > ? AND e.state = 'ready_for_sync'
ORDER BY e.cursor ASC
LIMIT ?
`);

const getQueuedCountStmt = db.prepare(
	"SELECT COUNT(*) AS count FROM events WHERE state != 'acked_by_plugin'"
);

function nowMs() {
	return Date.now();
}

function sanitizeSegment(value) {
	const cleaned = String(value).replace(/[^A-Za-z0-9_-]/g, "");
	return cleaned || "unknown";
}

function getExtFromName(name) {
	const base = String(name || "");
	const idx = base.lastIndexOf(".");
	return idx === -1 ? "bin" : base.slice(idx + 1) || "bin";
}

function formatRemoteKey({
	messageDateUnix,
	chatId,
	messageId,
	fileUniqueId,
	extension,
}) {
	const d = new Date(messageDateUnix * 1000);
	const pad = (n) => String(n).padStart(2, "0");
	const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
	return `${dateStr}-chat${sanitizeSegment(chatId)}-msg${sanitizeSegment(messageId)}-file${sanitizeSegment(fileUniqueId)}.${sanitizeSegment(extension)}`;
}

function replyJson(res, status, payload) {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolve(raw ? JSON.parse(raw) : {});
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});
}

function isAuthorizedRequest(req) {
	const header = req.headers.authorization || "";
	return header === `Bearer ${API_TOKEN}`;
}

function isAudioLikeDocument(doc) {
	if (!doc) {
		return false;
	}
	const mime = doc.mime_type || "";
	if (mime.startsWith("audio/")) {
		return true;
	}
	return /\.(mp3|m4a|ogg|opus|wav|flac|aac|webm|wma)$/i.test(
		doc.file_name || ""
	);
}

function getTelegramMessage(update) {
	return update.message || update.channel_post || null;
}

function isAllowedChatType(type) {
	return type === "private" || type === "channel" || type === "supergroup";
}

function isAllowedUser(message) {
	const userId = String(message.from?.id || message.chat?.id || "");
	const username = String(message.from?.username || message.chat?.username || "");
	if (ALLOWED_USERS.size === 0) {
		return true;
	}
	return ALLOWED_USERS.has(userId) || ALLOWED_USERS.has(username);
}

function detectKindAndAsset(message) {
	if (message.text) {
		return { kind: "text", asset: null };
	}
	if (Array.isArray(message.photo) && message.photo.length > 0) {
		const photo = message.photo[message.photo.length - 1];
		return {
			kind: "photo",
			asset: {
				file_id: photo.file_id,
				file_unique_id: photo.file_unique_id,
				filename: `photo.${getExtFromName(photo.file_path || "jpg")}`,
				mime_type: "image/jpeg",
			},
		};
	}
	if (message.video) {
		return {
			kind: "video",
			asset: {
				file_id: message.video.file_id,
				file_unique_id: message.video.file_unique_id,
				filename: message.video.file_name || "video.mp4",
				mime_type: message.video.mime_type || "video/mp4",
			},
		};
	}
	if (message.animation) {
		return {
			kind: "animation",
			asset: {
				file_id: message.animation.file_id,
				file_unique_id: message.animation.file_unique_id,
				filename: message.animation.file_name || "animation.mp4",
				mime_type: message.animation.mime_type || "video/mp4",
			},
		};
	}
	if (message.video_note) {
		return {
			kind: "video_note",
			asset: {
				file_id: message.video_note.file_id,
				file_unique_id: message.video_note.file_unique_id,
				filename: "video-note.mp4",
				mime_type: "video/mp4",
			},
		};
	}
	if (message.sticker) {
		return {
			kind: "sticker",
			asset: {
				file_id: message.sticker.file_id,
				file_unique_id: message.sticker.file_unique_id,
				filename: `sticker.${getExtFromName(message.sticker.set_name || "webp")}`,
				mime_type: "image/webp",
			},
		};
	}
	if (message.voice) {
		return {
			kind: "voice",
			asset: {
				file_id: message.voice.file_id,
				file_unique_id: message.voice.file_unique_id,
				filename: "voice.ogg",
				mime_type: message.voice.mime_type || "audio/ogg",
			},
		};
	}
	if (message.audio) {
		return {
			kind: "audio",
			asset: {
				file_id: message.audio.file_id,
				file_unique_id: message.audio.file_unique_id,
				filename: message.audio.file_name || "audio.bin",
				mime_type: message.audio.mime_type || "application/octet-stream",
			},
		};
	}
	if (message.document) {
		return {
			kind: isAudioLikeDocument(message.document) ? "audio" : "document",
			asset: {
				file_id: message.document.file_id,
				file_unique_id: message.document.file_unique_id,
				filename: message.document.file_name || "document.bin",
				mime_type:
					message.document.mime_type || "application/octet-stream",
			},
		};
	}
	return { kind: null, asset: null };
}

async function telegramApi(method, payload) {
	const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		throw new Error(`Telegram ${method} HTTP ${res.status}`);
	}
	const json = await res.json();
	if (!json.ok) {
		throw new Error(`Telegram ${method} failed`);
	}
	return json.result;
}

async function downloadTelegramAsset(message, asset) {
	const file = await telegramApi("getFile", { file_id: asset.file_id });
	if (!file.file_path) {
		throw new Error("Telegram getFile returned no file_path.");
	}
	const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
	const res = await fetch(fileUrl);
	if (!res.ok) {
		throw new Error(`Telegram file download HTTP ${res.status}`);
	}
	const buffer = Buffer.from(await res.arrayBuffer());
	const extension = getExtFromName(file.file_path || asset.filename);
	const remoteKey = formatRemoteKey({
		messageDateUnix: message.date,
		chatId: message.chat.id,
		messageId: message.message_id,
		fileUniqueId: asset.file_unique_id,
		extension,
	});
	const storedPath = join(DATA_DIR, "assets", remoteKey);
	writeFileSync(storedPath, buffer);
	const sha256 = createHash("sha256").update(buffer).digest("hex");
	return {
		asset_id: asset.file_unique_id,
		remote_key: remoteKey,
		filename: asset.filename,
		stored_path: storedPath,
		mime_type: asset.mime_type,
		size_bytes: buffer.byteLength,
		file_unique_id: asset.file_unique_id,
		extension,
		sha256,
		created_at: nowMs(),
	};
}

async function persistUpdate(update) {
	const message = getTelegramMessage(update);
	if (!message) {
		return { ok: true, skipped: true };
	}
	if (!message.chat || !isAllowedChatType(message.chat.type)) {
		return { ok: true, skipped: true };
	}
	if (!isAllowedUser(message)) {
		return { ok: true, skipped: true };
	}
	const detected = detectKindAndAsset(message);
	if (!detected.kind) {
		return { ok: true, skipped: true };
	}
	const eventId = `${String(message.chat.id)}:${String(message.message_id)}`;
	const insertInfo = insertEventStmt.run({
		event_id: eventId,
		update_id: update.update_id,
		chat_id: message.chat.id,
		message_id: message.message_id,
		message_date_unix: message.date,
		kind: detected.kind,
		state: "captured",
		message_json: JSON.stringify(message),
		asset_id: null,
		created_at: nowMs(),
		updated_at: nowMs(),
	});
	if (insertInfo.changes === 0) {
		return { ok: true, skipped: true, duplicate: true };
	}
	if (!detected.asset) {
		updateEventStmt.run({
			event_id: eventId,
			state: "ready_for_sync",
			asset_id: null,
			last_error: "",
			updated_at: nowMs(),
		});
		return { ok: true, skipped: false };
	}
	try {
		const saved = await downloadTelegramAsset(message, detected.asset);
		upsertAssetStmt.run(saved);
		updateEventStmt.run({
			event_id: eventId,
			state: "ready_for_sync",
			asset_id: saved.asset_id,
			last_error: "",
			updated_at: nowMs(),
		});
		return { ok: true, skipped: false };
	} catch (error) {
		updateEventStmt.run({
			event_id: eventId,
			state: "captured",
			asset_id: null,
			last_error: error instanceof Error ? error.message : String(error),
			updated_at: nowMs(),
		});
		return { ok: false, skipped: false };
	}
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url || "/", `http://${req.headers.host}`);
		if (req.method === "GET" && url.pathname === "/health") {
			if (!isAuthorizedRequest(req)) {
				replyJson(res, 401, { ok: false, detail: "Unauthorized" });
				return;
			}
			const dbSize = statSync(join(DATA_DIR, "receiver.sqlite")).size;
			replyJson(res, 200, {
				ok: true,
				detail: `Receiver OK. queued=${String(getQueuedCountStmt.get().count)} dbBytes=${String(dbSize)}`,
			});
			return;
		}

		if (req.method === "POST" && url.pathname === `/telegram/webhook/${BOT_TOKEN}`) {
			const body = await readJsonBody(req);
			const result = await persistUpdate(body);
			replyJson(res, 200, result);
			return;
		}

		if (!isAuthorizedRequest(req)) {
			replyJson(res, 401, { ok: false, detail: "Unauthorized" });
			return;
		}

		if (req.method === "GET" && url.pathname === "/events") {
			const cursor = Number(url.searchParams.get("cursor") || "0");
			const limit = Math.max(
				1,
				Math.min(100, Number(url.searchParams.get("limit") || "20"))
			);
			const rows = listEventsStmt.all(cursor, limit);
			const nextCursor = rows.length > 0 ? rows[rows.length - 1].cursor : cursor;
			replyJson(res, 200, {
				events: rows.map((row) => ({
					eventId: row.event_id,
					cursor: row.cursor,
					updateId: row.update_id,
					chatId: row.chat_id,
					messageId: row.message_id,
					messageDateUnix: row.message_date_unix,
					kind: row.kind,
					state: row.state,
					messageJson: row.message_json,
					asset: row.asset_id
						? {
							assetId: row.asset_id,
							remoteKey: row.remote_key,
							filename: row.filename,
							mimeType: row.mime_type,
							sizeBytes: row.size_bytes,
							fileUniqueId: row.file_unique_id,
							extension: row.extension,
							sha256: row.sha256,
						}
						: undefined,
				})),
				nextCursor,
			});
			return;
		}

		if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
			const assetId = decodeURIComponent(url.pathname.slice("/assets/".length));
			const asset = getAssetStmt.get(assetId);
			if (!asset) {
				replyJson(res, 404, { ok: false, detail: "Asset not found" });
				return;
			}
			const bytes = readFileSync(asset.stored_path);
			res.writeHead(200, {
				"Content-Type": asset.mime_type,
				"Content-Length": String(bytes.byteLength),
				"X-Asset-Sha256": asset.sha256,
			});
			res.end(bytes);
			return;
		}

		if (
			req.method === "POST" &&
			/^\/events\/[^/]+\/ack$/.test(url.pathname)
		) {
			const eventId = decodeURIComponent(
				url.pathname.replace(/^\/events\/([^/]+)\/ack$/, "$1")
			);
			updateEventStmt.run({
				event_id: eventId,
				state: "acked_by_plugin",
				asset_id: null,
				last_error: "",
				updated_at: nowMs(),
			});
			replyJson(res, 200, { ok: true });
			return;
		}

		if (
			req.method === "POST" &&
			/^\/events\/[^/]+\/fail$/.test(url.pathname)
		) {
			const eventId = decodeURIComponent(
				url.pathname.replace(/^\/events\/([^/]+)\/fail$/, "$1")
			);
			const body = await readJsonBody(req);
			updateEventStmt.run({
				event_id: eventId,
				state: "ready_for_sync",
				asset_id: null,
				last_error: String(body.error || "unknown"),
				updated_at: nowMs(),
			});
			replyJson(res, 200, { ok: true });
			return;
		}

		replyJson(res, 404, { ok: false, detail: "Not found" });
	} catch (error) {
		replyJson(res, 500, {
			ok: false,
			detail: error instanceof Error ? error.message : String(error),
		});
	}
});

server.listen(PORT, HOST, () => {
	console.log(
		`Telegram journal receiver listening on http://${HOST}:${String(PORT)}`
	);
	console.log(
		`Webhook path: /telegram/webhook/${BOT_TOKEN}`
	);
});
