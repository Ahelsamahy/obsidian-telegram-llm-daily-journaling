#!/usr/bin/env node
// Cross-platform test runner: discovers test/*.spec.ts recursively (npm globs fail on Linux CI).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, acc = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) {
			walk(p, acc);
		} else if (e.name.endsWith(".spec.ts")) {
			acc.push(p);
		}
	}
	return acc;
}

const files = walk(join(root, "test")).sort();
if (files.length === 0) {
	console.error("No .spec.ts files found under test/");
	process.exit(1);
}

const r = spawnSync(
	process.execPath,
	[
		"--test",
		"--require",
		"tsx/cjs",
		"--require",
		join(root, "test/register-obsidian.cjs"),
		...files,
	],
	{ stdio: "inherit", cwd: root, env: process.env }
);
process.exit(r.status ?? 1);
