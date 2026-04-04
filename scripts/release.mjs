#!/usr/bin/env node
/**
 * Release: verify build, lint, test → npm version (bump + tag) → git push with tags.
 *
 * Usage:
 *   npm run release              # patch (0.1.1 → 0.1.2)
 *   npm run release -- minor
 *   npm run release -- major
 *   npm run release -- --dry-run # checks only; no version bump or push
 *
 * Requires a clean git working tree (except ignored files like main.js).
 * `npm version` updates package.json, runs version-bump.mjs (manifest + versions.json), commits, creates tag.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bump = ["patch", "minor", "major"].find((b) => args.includes(b)) ?? "patch";

function run(name, cmdArgs, extraEnv = {}) {
	const r = spawnSync(name, cmdArgs, {
		stdio: "inherit",
		env: { ...process.env, ...extraEnv },
	});
	if (r.status !== 0 && r.status !== null) {
		process.exit(r.status);
	}
}

console.log(`Release (${dryRun ? "dry-run" : bump})\n`);

run("npm", ["run", "build"]);
run("npm", ["run", "lint"]);
run("npm", ["test"], { HF_API_INTEGRATION: "0" });

if (dryRun) {
	console.log("\n--dry-run: skipping npm version and git push.");
	process.exit(0);
}

const msg = "chore: release %s";
run("npm", ["version", bump, "-m", msg]);

const push = spawnSync("git", ["push", "--follow-tags"], { stdio: "inherit" });
if (push.status !== 0 && push.status !== null) {
	process.exit(push.status);
}

console.log(
	"\nDone. Tag pushed — the Release Obsidian plugin workflow should create a draft GitHub Release with main.js, manifest.json, and styles.css. Publish it under Releases after adding notes."
);
