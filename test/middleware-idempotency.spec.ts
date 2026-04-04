import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Composer, type Context } from "grammy";
import { createIdempotentUpdateMiddleware } from "../src/bot/middleware";

/** Same as grammy’s internal `run` (not exported from package root). */
async function runMiddleware<C extends Context>(
	middleware: (ctx: C, next: () => Promise<void>) => Promise<void>,
	ctx: C
): Promise<void> {
	const leaf = (): Promise<void> => Promise.resolve();
	await middleware(ctx, leaf);
}

function minimalContext(updateId: number): Context {
	return { update: { update_id: updateId } } as Context;
}

describe("createIdempotentUpdateMiddleware", () => {
	test("runs downstream and persists when update_id is new", async () => {
		let lastProcessed = 0;
		const persisted: number[] = [];
		const logs: string[] = [];

		const chain = new Composer<Context>();
		chain.use(
			createIdempotentUpdateMiddleware(
				() => lastProcessed,
				(id) => {
					persisted.push(id);
					lastProcessed = id;
				},
				(m) => {
					logs.push(m);
				}
			)
		);

		let downstream = 0;
		chain.use(async () => {
			downstream += 1;
		});

		await runMiddleware(chain.middleware(), minimalContext(42));

		assert.strictEqual(downstream, 1);
		assert.deepStrictEqual(persisted, [42]);
		assert.strictEqual(lastProcessed, 42);
		assert.strictEqual(logs.length, 0);
	});

	test("skips downstream and does not persist duplicate update_id", async () => {
		let lastProcessed = 100;
		const persisted: string[] = [];
		const logs: string[] = [];

		const chain = new Composer<Context>();
		chain.use(
			createIdempotentUpdateMiddleware(
				() => lastProcessed,
				(id) => {
					persisted.push(String(id));
				},
				(m) => {
					logs.push(m);
				}
			)
		);

		let downstream = 0;
		chain.use(async () => {
			downstream += 1;
		});

		await runMiddleware(chain.middleware(), minimalContext(100));

		assert.strictEqual(downstream, 0);
		assert.strictEqual(persisted.length, 0);
		assert.ok(logs.some((l) => l.includes("Skip duplicate")));
		assert.ok(logs.some((l) => l.includes("100")));
	});

	test("does not persist when downstream throws", async () => {
		let lastProcessed = 0;
		const persisted: number[] = [];

		const chain = new Composer<Context>();
		chain.use(
			createIdempotentUpdateMiddleware(
				() => lastProcessed,
				(id) => {
					persisted.push(id);
					lastProcessed = id;
				},
				() => {}
			)
		);

		chain.use(async () => {
			throw new Error("vault failed");
		});

		await assert.rejects(
			async () => {
				await runMiddleware(chain.middleware(), minimalContext(7));
			},
			/vault failed/
		);

		assert.strictEqual(persisted.length, 0);
		assert.strictEqual(lastProcessed, 0);
	});
});
