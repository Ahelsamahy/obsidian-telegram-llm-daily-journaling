#!/usr/bin/env node
/**
 * Commit and push the GitHub wiki working copy at `.wiki/`.
 *
 * Usage:
 *   npm run wiki:deploy -- "your commit message"
 *   WIKI_COMMIT_MSG="msg" npm run wiki:deploy
 *   npm run wiki:deploy   # prompts for message when there are local changes (TTY only)
 *
 * First run clones `WIKI_REPO_URL` (default: this repo’s wiki remote) into `.wiki/`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const wikiDir = join(root, ".wiki");

const defaultWikiRemote =
	"https://github.com/Ahelsamahy/obsidian-telegram-llm-daily-journaling.wiki.git";

function runGit(args) {
	const r = spawnSync("git", args, {
		cwd: wikiDir,
		encoding: "utf8",
		stdio: "inherit",
	});
	if (r.status !== 0 && r.status !== null) {
		process.exit(r.status);
	}
}

function gitOutput(args) {
	const r = spawnSync("git", args, {
		cwd: wikiDir,
		encoding: "utf8",
	});
	if (r.status !== 0) {
		process.stderr.write(r.stderr ?? "");
		process.exit(r.status ?? 1);
	}
	return (r.stdout ?? "").trim();
}

async function main() {
	const wikiRemote = process.env.WIKI_REPO_URL?.trim() || defaultWikiRemote;

	if (!existsSync(join(wikiDir, ".git"))) {
		if (existsSync(wikiDir)) {
			console.error(
				`Refusing to clone: ${wikiDir} exists but is not a git repo. Remove it or clone manually.`
			);
			process.exit(1);
		}
		console.log(`Cloning wiki into ${wikiDir} …`);
		const r = spawnSync(
			"git",
			["clone", wikiRemote, wikiDir],
			{ stdio: "inherit", cwd: root }
		);
		if (r.status !== 0) {
			process.exit(r.status ?? 1);
		}
	}

	runGit(["fetch", "origin"]);

	const dirty = gitOutput(["status", "--porcelain"]);
	const branch = gitOutput(["branch", "--show-current"]) || "master";

	let message = process.argv.slice(2).join(" ").trim();
	if (!message) {
		message = process.env.WIKI_COMMIT_MSG?.trim() ?? "";
	}

	if (dirty) {
		if (!message) {
			if (process.stdin.isTTY) {
				const rl = createInterface({
					input: process.stdin,
					output: process.stdout,
				});
				try {
					message = (await rl.question("Commit message: ")).trim();
				} finally {
					rl.close();
				}
			}
			if (!message) {
				console.error(
					"Wiki has uncommitted changes. Provide a message:\n" +
						`  npm run wiki:deploy -- "your message"\n` +
						"  WIKI_COMMIT_MSG=... npm run wiki:deploy"
				);
				process.exit(1);
			}
		}
		runGit(["add", "-A"]);
		runGit(["commit", "-m", message]);
	} else {
		console.log("Wiki working tree clean (nothing to commit).");
	}

	runGit(["pull", "--rebase", "origin", branch]);
	runGit(["push", "origin", branch]);
	console.log("Wiki deploy finished.");
}

await main();
