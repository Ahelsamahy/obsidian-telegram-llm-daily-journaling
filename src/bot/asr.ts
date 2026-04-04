import { requestUrl } from "obsidian";
import type { JournalSettings } from "../settings/types";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";

/** Injected in tests; production uses Obsidian `requestUrl`. */
export type RequestUrlAdapter = (
	param: string | RequestUrlParam
) => Promise<RequestUrlResponse>;

export function buildMultipartAudioBody(
	boundary: string,
	filename: string,
	audio: ArrayBuffer,
	model: string
): ArrayBuffer {
	const encoder = new TextEncoder();
	const crlf = "\r\n";
	const safeName = filename.replace(/"/g, "");
	const header =
		`--${boundary}${crlf}` +
		`Content-Disposition: form-data; name="file"; filename="${safeName}"${crlf}` +
		`Content-Type: application/octet-stream${crlf}${crlf}`;
	const footer =
		`${crlf}--${boundary}${crlf}` +
		`Content-Disposition: form-data; name="model"${crlf}${crlf}` +
		`${model}${crlf}--${boundary}--${crlf}`;
	const h = encoder.encode(header);
	const f = encoder.encode(footer);
	const audioU8 = new Uint8Array(audio);
	const out = new Uint8Array(h.length + audioU8.length + f.length);
	out.set(h, 0);
	out.set(audioU8, h.length);
	out.set(f, h.length + audioU8.length);
	return out.buffer;
}

export async function transcribeWithLocalAsr(
	settings: JournalSettings,
	audioBytes: ArrayBuffer,
	filename: string,
	requestImpl: RequestUrlAdapter = (p) => requestUrl(p)
): Promise<string> {
	if (!settings.transcription_enabled) {
		throw new Error("Transcription is disabled in settings");
	}

	const base = settings.asr_base_url.replace(/\/$/, "");
	const url = `${base}/audio/transcriptions`;
	const boundary = `obsidian_tg_${Math.random().toString(36).slice(2)}`;
	const body = buildMultipartAudioBody(boundary, filename, audioBytes, settings.asr_model);

	const headers: Record<string, string> = {
		"Content-Type": `multipart/form-data; boundary=${boundary}`,
	};
	if (settings.asr_api_key) {
		headers.Authorization = `Bearer ${settings.asr_api_key}`;
	}

	const res = await requestImpl({
		url,
		method: "POST",
		headers,
		body,
		throw: false,
	});

	if (res.status < 200 || res.status >= 300) {
		throw new Error(`ASR HTTP ${String(res.status)}: ${res.text}`);
	}

	const data = res.json as { text?: string };
	if (typeof data.text !== "string" || data.text.length === 0) {
		throw new Error("ASR response missing text");
	}
	return data.text;
}
