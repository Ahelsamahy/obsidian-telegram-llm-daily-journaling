#!/usr/bin/env node
/**
 * Copies built plugin artifacts into a dev vault's .obsidian/plugins/<id>/ folder.
 * Reads repo-root .env (see .env.example). Does not override variables already set in the shell.
 */
import process from "node:process";
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnv() {
	const envPath = join(root, ".env");
	if (!existsSync(envPath)) {
		return;
	}
	const text = readFileSync(envPath, "utf8");
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq === -1) {
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		let val = trimmed.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		if (process.env[key] === undefined) {
			process.env[key] = val;
		}
	}
}

loadDotEnv();

const vault =
	process.env.TELEGRAM_LLM_DAILY_JOURNALING_DEV_VAULT ??
	process.env.OBSIDIAN_DEV_VAULT;

if (!vault) {
	console.error(
		"Set TELEGRAM_LLM_DAILY_JOURNALING_DEV_VAULT or OBSIDIAN_DEV_VAULT in .env (see .env.example)."
	);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const pluginId = manifest.id;
const destDir = join(vault, ".obsidian", "plugins", pluginId);

const files = ["main.js", "manifest.json", "styles.css"];

for (const f of files) {
	const src = join(root, f);
	if (!existsSync(src)) {
		console.error(`Missing ${f}. Run: npm run build`);
		process.exit(1);
	}
}

mkdirSync(destDir, { recursive: true });
for (const f of files) {
	copyFileSync(join(root, f), join(destDir, f));
}

console.log(`Deployed "${pluginId}" to:\n  ${destDir}`);
