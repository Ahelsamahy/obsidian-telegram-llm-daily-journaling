import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { isMediaDownloadAllowedByNetworkPolicy } from "../src/utils/network";

describe("isMediaDownloadAllowedByNetworkPolicy", () => {
	const origNav = globalThis.navigator;

	afterEach(() => {
		if (origNav !== undefined) {
			Object.defineProperty(globalThis, "navigator", {
				value: origNav,
				configurable: true,
				writable: true,
			});
		} else {
			delete (globalThis as { navigator?: Navigator }).navigator;
		}
	});

	test("always allows when Wi‑Fi only is off", () => {
		assert.strictEqual(
			isMediaDownloadAllowedByNetworkPolicy({ download_media_wifi_only: false }),
			true
		);
	});

	test("allows when Wi‑Fi only is on but connection type is unknown", () => {
		Object.defineProperty(globalThis, "navigator", {
			value: {},
			configurable: true,
			writable: true,
		});
		assert.strictEqual(
			isMediaDownloadAllowedByNetworkPolicy({ download_media_wifi_only: true }),
			true
		);
	});

	test("allows wifi when Wi‑Fi only is on", () => {
		Object.defineProperty(globalThis, "navigator", {
			value: { connection: { type: "wifi" } },
			configurable: true,
			writable: true,
		});
		assert.strictEqual(
			isMediaDownloadAllowedByNetworkPolicy({ download_media_wifi_only: true }),
			true
		);
	});

	test("blocks cellular when Wi‑Fi only is on", () => {
		Object.defineProperty(globalThis, "navigator", {
			value: { connection: { type: "cellular" } },
			configurable: true,
			writable: true,
		});
		assert.strictEqual(
			isMediaDownloadAllowedByNetworkPolicy({ download_media_wifi_only: true }),
			false
		);
	});

	test("blocks wimax when Wi‑Fi only is on", () => {
		Object.defineProperty(globalThis, "navigator", {
			value: { connection: { type: "wimax" } },
			configurable: true,
			writable: true,
		});
		assert.strictEqual(
			isMediaDownloadAllowedByNetworkPolicy({ download_media_wifi_only: true }),
			false
		);
	});

	test("allows ethernet when Wi‑Fi only is on", () => {
		Object.defineProperty(globalThis, "navigator", {
			value: { connection: { type: "ethernet" } },
			configurable: true,
			writable: true,
		});
		assert.strictEqual(
			isMediaDownloadAllowedByNetworkPolicy({ download_media_wifi_only: true }),
			true
		);
	});
});
