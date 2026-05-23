import { requestUrl } from "obsidian";
import type { JournalSettings } from "../settings/types";
import type { ReceiverCursorPage } from "./types";

type LogFn = (message: string) => void;

function trimSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function buildHeaders(settings: Pick<JournalSettings, "receiver_api_token">): Record<string, string> {
	return {
		Authorization: `Bearer ${settings.receiver_api_token}`,
		"Content-Type": "application/json",
	};
}

export class RemoteReceiverClient {
	constructor(
		private readonly settings: Pick<
			JournalSettings,
			"receiver_base_url" | "receiver_api_token" | "receiver_health_timeout_ms"
		>,
		private readonly log: LogFn = () => {}
	) {}

	private get baseUrl(): string {
		return trimSlash(this.settings.receiver_base_url.trim());
	}

	private requireConfigured(): void {
		if (!this.baseUrl || !this.settings.receiver_api_token.trim()) {
			throw new Error("Remote receiver is not configured.");
		}
	}

	async fetchEvents(cursor: number, limit: number): Promise<ReceiverCursorPage> {
		this.requireConfigured();
		const url =
			`${this.baseUrl}/events?cursor=${encodeURIComponent(String(cursor))}` +
			`&limit=${encodeURIComponent(String(limit))}`;
		const res = await requestUrl({
			url,
			method: "GET",
			headers: buildHeaders(this.settings),
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`Receiver events HTTP ${String(res.status)}: ${res.text}`);
		}
		return res.json as ReceiverCursorPage;
	}

	async downloadAsset(assetId: string): Promise<ArrayBuffer> {
		this.requireConfigured();
		const res = await requestUrl({
			url: `${this.baseUrl}/assets/${encodeURIComponent(assetId)}`,
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.settings.receiver_api_token}`,
			},
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`Receiver asset HTTP ${String(res.status)}: ${res.text}`);
		}
		return res.arrayBuffer;
	}

	async ackEvent(eventId: string): Promise<void> {
		await this.postStateChange(eventId, "ack");
	}

	async failEvent(eventId: string, error: string): Promise<void> {
		await this.postStateChange(eventId, "fail", { error });
	}

	private async postStateChange(
		eventId: string,
		action: "ack" | "fail",
		payload: Record<string, string> = {}
	): Promise<void> {
		this.requireConfigured();
		const res = await requestUrl({
			url: `${this.baseUrl}/events/${encodeURIComponent(eventId)}/${action}`,
			method: "POST",
			headers: buildHeaders(this.settings),
			body: JSON.stringify(payload),
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) {
			throw new Error(
				`Receiver ${action} HTTP ${String(res.status)}: ${res.text}`
			);
		}
	}

	async healthCheck(): Promise<{ ok: boolean; detail: string }> {
		if (!this.baseUrl || !this.settings.receiver_api_token.trim()) {
			return { ok: false, detail: "Receiver URL or API token is missing." };
		}
		try {
			const res = await requestUrl({
				url: `${this.baseUrl}/health`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.settings.receiver_api_token}`,
				},
				throw: false,
			});
			if (res.status < 200 || res.status >= 300) {
				return {
					ok: false,
					detail: `Receiver health HTTP ${String(res.status)}.`,
				};
			}
			const json = res.json as { ok?: boolean; detail?: string };
			return {
				ok: Boolean(json.ok),
				detail: json.detail ?? "Receiver health returned OK.",
			};
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : String(error);
			this.log(`Receiver health error: ${detail}`);
			return { ok: false, detail };
		}
	}
}
