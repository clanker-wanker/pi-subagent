import test from "node:test";
import assert from "node:assert/strict";
import { acquireSlot, releaseSlot, resetQueue } from "../queue.ts";

const VAR = "PI_SUBAGENT_MAX_CONCURRENT";

function withEnv(value, fn) {
	const prev = process.env[VAR];
	if (value === undefined) delete process.env[VAR];
	else process.env[VAR] = value;
	return Promise.resolve()
		.then(fn)
		.finally(() => {
			if (prev === undefined) delete process.env[VAR];
			else process.env[VAR] = prev;
		});
}

const settle = () => new Promise((r) => setImmediate(r));

async function assertPending(p) {
	let done = false;
	p.then(
		() => {
			done = true;
		},
		() => {
			done = true;
		},
	);
	await new Promise((r) => setTimeout(r, 50));
	assert.equal(done, false, "promise should not have resolved yet");
}

test("unlimited by default: acquires never queue", async () => {
	resetQueue();
	await withEnv(undefined, async () => {
		for (let i = 0; i < 5; i++) {
			assert.equal(await acquireSlot(), "immediate");
		}
	});
});

test("limit enforced: third acquire waits until a slot frees", async () => {
	resetQueue();
	await withEnv("2", async () => {
		assert.equal(await acquireSlot(), "immediate");
		assert.equal(await acquireSlot(), "immediate");
		const third = acquireSlot();
		await assertPending(third);
		releaseSlot();
		await settle();
		assert.equal(await third, "waited");
		releaseSlot();
		releaseSlot();
	});
});

test("FIFO order: waiters are granted in insertion order", async () => {
	resetQueue();
	await withEnv("1", async () => {
		assert.equal(await acquireSlot(), "immediate"); // A holds the slot
		const b = acquireSlot();
		const c = acquireSlot();
		await assertPending(b);
		await assertPending(c);
		releaseSlot();
		await settle();
		assert.equal(await b, "waited");
		releaseSlot();
		await settle();
		assert.equal(await c, "waited");
		releaseSlot();
	});
});

test("invalid values fall through to unlimited", async () => {
	for (const bad of ["0", "-1", "abc", ""]) {
		resetQueue();
		await withEnv(bad, async () => {
			for (let i = 0; i < 3; i++) {
				assert.equal(await acquireSlot(), "immediate");
			}
		});
	}
});

test("abort while queued: waiter removed without consuming a slot", async () => {
	resetQueue();
	await withEnv("1", async () => {
		assert.equal(await acquireSlot(), "immediate"); // hold the slot
		const ctrl = new AbortController();
		const p = acquireSlot(ctrl.signal);
		await assertPending(p);
		ctrl.abort();
		await settle();
		assert.equal(await p, "aborted");
		releaseSlot(); // frees the held slot; the aborted waiter must not take it
		await settle();
		assert.equal(await acquireSlot(), "immediate");
		releaseSlot();
	});
});

test("pre-aborted signal resolves aborted immediately", async () => {
	resetQueue();
	await withEnv("1", async () => {
		assert.equal(await acquireSlot(), "immediate"); // hold the slot
		const ctrl = new AbortController();
		ctrl.abort();
		assert.equal(await acquireSlot(ctrl.signal), "aborted");
		releaseSlot();
	});
});
