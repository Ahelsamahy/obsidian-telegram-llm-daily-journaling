import { normalizePath, requestUrl, type Vault } from "obsidian";

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
		const normalized = normalizePath(vaultRelativePath).replace(/^\/+/, "");
		const parent = dirnameVaultPath(normalized);
		if (parent !== "") {
			await ensureFolderExists(vault, parent);
		}
		const fileArrayBuffer = await requestUrl(url).arrayBuffer;
		await vault.createBinary(normalized, fileArrayBuffer);
		return true;
	} catch (error) {
		console.error("Error downloading file:", error);
		return false;
	}
}
