import { createHash } from "crypto";
import {
	normalizePath,
	type TFile,
	requestUrl,
	type Vault,
} from "obsidian";

function dirnameVaultPath(normalizedFilePath: string): string {
	const i = normalizedFilePath.lastIndexOf("/");
	return i <= 0 ? "" : normalizedFilePath.slice(0, i);
}

/** Create each folder segment under the vault root so `filePath` can be created. */
export async function ensureFolderExists(
	vault: Vault,
	folderPath: string
): Promise<void> {
	const normalized = normalizePath(folderPath).replace(/^\/+/, "");
	if (normalized === "") {
		return;
	}
	const segments = normalized.split("/").filter(Boolean);
	let acc = "";
	for (const seg of segments) {
		acc = acc === "" ? seg : `${acc}/${seg}`;
		if (vault.getAbstractFileByPath(acc)) {
			continue;
		}
		await vault.createFolder(acc);
	}
}

export async function downloadAndSaveFile(
	vault: Vault,
	url: string,
	vaultRelativePath: string
): Promise<boolean> {
	try {
		const fileArrayBuffer = await requestUrl(url).arrayBuffer;
		const result = await saveBinaryToVault(
			vault,
			vaultRelativePath,
			fileArrayBuffer
		);
		return result.ok;
	} catch (error) {
		console.error("Error downloading file:", error);
		return false;
	}
}

export type BinarySaveResult = {
	ok: boolean;
	existed: boolean;
	path: string;
	sha256: string;
	sizeBytes: number;
};

function sha256Bytes(buffer: ArrayBuffer): string {
	const hash = createHash("sha256");
	hash.update(Buffer.from(buffer));
	return hash.digest("hex");
}

function isTFile(file: unknown): file is TFile {
	return Boolean(file && typeof file === "object" && "path" in file);
}

export async function saveBinaryToVault(
	vault: Vault,
	vaultRelativePath: string,
	fileArrayBuffer: ArrayBuffer
): Promise<BinarySaveResult> {
	try {
		const normalized = normalizePath(vaultRelativePath).replace(/^\/+/, "");
		const parent = dirnameVaultPath(normalized);
		if (parent !== "") {
			await ensureFolderExists(vault, parent);
		}
		const sha256 = sha256Bytes(fileArrayBuffer);
		const existing = vault.getAbstractFileByPath(normalized);
		if (isTFile(existing)) {
			const current = await vault.readBinary(existing);
			const currentHash = sha256Bytes(current);
			if (
				current.byteLength === fileArrayBuffer.byteLength &&
				currentHash === sha256
			) {
				return {
					ok: true,
					existed: true,
					path: normalized,
					sha256,
					sizeBytes: fileArrayBuffer.byteLength,
				};
			}
			await vault.modifyBinary(existing, fileArrayBuffer);
			return {
				ok: true,
				existed: true,
				path: normalized,
				sha256,
				sizeBytes: fileArrayBuffer.byteLength,
			};
		}
		await vault.createBinary(normalized, fileArrayBuffer);
		return {
			ok: true,
			existed: false,
			path: normalized,
			sha256,
			sizeBytes: fileArrayBuffer.byteLength,
		};
	} catch (error) {
		console.error("Error saving file:", error);
		return {
			ok: false,
			existed: false,
			path: normalizePath(vaultRelativePath).replace(/^\/+/, ""),
			sha256: "",
			sizeBytes: fileArrayBuffer.byteLength,
		};
	}
}
