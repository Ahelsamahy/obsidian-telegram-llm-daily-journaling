import { requestUrl } from "obsidian";

/**
 * Curated ASR ids (offline fallback + top of the picker). Order matters.
 *
 * The repo’s `scripts/asr-serve.sh` path uses [mlx-qwen3-asr](https://github.com/moona3k/mlx-qwen3-asr);
 * the **Qwen** entries match that stack. Whisper / Distil rows are common Hub ASR ids for users who run
 * a different local server; only pick them if your server actually loads that checkpoint (otherwise use
 * “Other” or refresh-from-Hub). Add more entries only when the wiki documents how to serve them.
 */
export const CURATED_ASR_MODEL_IDS: readonly string[] = [
	"Qwen/Qwen3-ASR-1.7B",
	"Qwen/Qwen3-ASR-1.7B",
	"openai/whisper-large-v3-turbo",
	"openai/whisper-large-v3",
	"distil-whisper/distil-large-v3",
];

/** Public Hub JSON API used by “Refresh from Hugging Face” (same URL as browser). */
export const HF_ASR_MODELS_API_URL =
	"https://huggingface.co/api/models?pipeline_tag=automatic-speech-recognition&limit=100";

/** Dropdown sentinel when the active `asr_model` is not in the merged preset/cache list. */
export const CUSTOM_ASR_MODEL_DROPDOWN_VALUE = "__custom__";

export type HfModelApiRow = {
	id?: string;
	modelId?: string;
	trendingScore?: number;
	likes?: number;
	downloads?: number;
};

/** Merge curated first, then cached HF ids (deduped, cached sorted). */
export function mergeAsrModelPickerIds(
	cachedIds: readonly string[] | undefined
): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const id of CURATED_ASR_MODEL_IDS) {
		if (!seen.has(id)) {
			seen.add(id);
			out.push(id);
		}
	}
	const rest = [...(cachedIds ?? [])].filter((id) => id && !seen.has(id));
	rest.sort((a, b) => a.localeCompare(b));
	for (const id of rest) {
		seen.add(id);
		out.push(id);
	}
	return out;
}

function scoreRow(r: HfModelApiRow): number {
	const t = r.trendingScore ?? 0;
	const l = r.likes ?? 0;
	const d = r.downloads ?? 0;
	return t * 1e9 + l * 1e6 + d;
}

/** Parse Hub `/api/models` JSON array into sorted unique model ids. */
export function parseAndSortAsrModelIdsFromHubJson(rows: unknown): string[] {
	if (!Array.isArray(rows)) {
		return [];
	}
	const scored: { id: string; score: number }[] = [];
	for (const row of rows) {
		const r = row as HfModelApiRow;
		const id = (r.id ?? r.modelId ?? "").trim();
		if (!id || !id.includes("/")) {
			continue;
		}
		scored.push({ id, score: scoreRow(r) });
	}
	scored.sort((a, b) => b.score - a.score);
	const out: string[] = [];
	const seen = new Set<string>();
	for (const { id } of scored) {
		if (!seen.has(id)) {
			seen.add(id);
			out.push(id);
		}
	}
	return out;
}

export type FetchAsrModelsFromHuggingFaceResult = {
	ids: string[];
	error?: string;
};

export async function fetchAsrModelsFromHuggingFace(
	hfToken: string | undefined
): Promise<FetchAsrModelsFromHuggingFaceResult> {
	const headers: Record<string, string> = {
		Accept: "application/json",
	};
	const token = hfToken?.trim();
	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}
	try {
		const res = await requestUrl({
			url: HF_ASR_MODELS_API_URL,
			method: "GET",
			headers,
		});
		if (res.status !== 200) {
			return {
				ids: [],
				error: `Hugging Face returned HTTP ${res.status}`,
			};
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(res.text) as unknown;
		} catch {
			return { ids: [], error: "Invalid JSON from Hugging Face" };
		}
		const ids = parseAndSortAsrModelIdsFromHubJson(parsed);
		if (ids.length === 0) {
			return { ids: [], error: "No ASR models in response" };
		}
		return { ids };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { ids: [], error: msg };
	}
}
