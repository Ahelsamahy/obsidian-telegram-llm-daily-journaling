import { normalizePath } from "obsidian";

const CUTOFF_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SIMPLE_URL_RE = /^https?:\/\/[^/\s]+(?:\/.*)?$/i;
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export function normalizeAllowedUsersInput(values: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const value of values) {
		const cleaned = value.trim().replace(/^@+/, "");
		if (cleaned === "" || seen.has(cleaned)) {
			continue;
		}
		seen.add(cleaned);
		normalized.push(cleaned);
	}
	return normalized;
}

export function isValidDailyCutoff(value: string): boolean {
	return CUTOFF_RE.test(value.trim());
}

export function normalizeDailyCutoff(value: string): string {
	const trimmed = value.trim();
	return isValidDailyCutoff(trimmed) ? trimmed : "00:00";
}

export function isValidReceiverBaseUrl(value: string): boolean {
	const trimmed = value.trim();
	return trimmed === "" || SIMPLE_URL_RE.test(trimmed);
}

export function isValidMediaSubfolderName(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed === "" || trimmed === "." || trimmed === "..") {
		return false;
	}
	if (trimmed.includes("/") || trimmed.includes("\\")) {
		return false;
	}
	return SAFE_SEGMENT_RE.test(trimmed);
}

export function normalizeDownloadDir(value: string): string {
	return normalizePath(value.trim()).replace(/^\/+/, "");
}
