import type { JournalSettings } from "../settings/types";

/** When "Wi‑Fi only" is on, block downloads on cellular-like connections when the Network Information API reports a type. Unknown/undefined allows download (desktop, privacy). */
export function isMediaDownloadAllowedByNetworkPolicy(
	settings: Pick<JournalSettings, "download_media_wifi_only">
): boolean {
	if (!settings.download_media_wifi_only) {
		return true;
	}
	const nav = typeof navigator !== "undefined" ? navigator : undefined;
	const conn =
		nav && "connection" in nav
			? (nav as Navigator & { connection?: { type?: string } }).connection
			: undefined;
	const type = conn?.type;
	if (type === undefined || type === "unknown" || type === "mixed") {
		return true;
	}
	if (type === "wifi" || type === "ethernet" || type === "bluetooth") {
		return true;
	}
	if (type === "cellular" || type === "wimax") {
		return false;
	}
	return true;
}
