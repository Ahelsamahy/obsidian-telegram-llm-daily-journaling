export type CaptureMode = "embedded_bot" | "remote_receiver";

export type RemoteJournalEventKind =
	| "text"
	| "photo"
	| "video"
	| "animation"
	| "video_note"
	| "sticker"
	| "document"
	| "audio"
	| "voice";

export type LocalImportJobState =
	| "fetched"
	| "asset_saved"
	| "note_written"
	| "acked"
	| "transcript_pending"
	| "transcript_failed"
	| "failed";

export type TranscriptionJobState = "pending" | "completed" | "failed";

export interface RemoteReceiverAsset {
	assetId: string;
	remoteKey: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	fileUniqueId: string;
	extension: string;
	sha256: string;
}

export interface RemoteJournalEvent {
	eventId: string;
	cursor: number;
	updateId: number;
	chatId: number;
	messageId: number;
	messageDateUnix: number;
	kind: RemoteJournalEventKind;
	messageJson: string;
	state: "captured" | "media_downloaded" | "ready_for_sync" | "acked_by_plugin";
	asset?: RemoteReceiverAsset;
}

export interface ReceiverCursorPage {
	events: RemoteJournalEvent[];
	nextCursor: number;
}

export interface LocalImportJob {
	eventId: string;
	cursor: number;
	state: LocalImportJobState;
	retryCount: number;
	lastError: string;
	messageDateUnix: number;
	chatId: number;
	messageId: number;
	notePath: string;
	receiptMarker: string;
	vaultAssetPath: string;
	transcriptionState: TranscriptionJobState | "";
	lastAttemptEpochMs: number;
}
