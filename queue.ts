/**
 * Minimal FIFO concurrency queue for subagent processes.
 *
 * PI_SUBAGENT_MAX_CONCURRENT caps how many subagent processes run at once.
 * Unset or invalid (non-numeric, 0, negative) → unlimited (current behavior).
 * Module-level state: the extension runs in a single pi process.
 */

import { pickEnvNumber } from "./types.ts";

export type AcquireOutcome = "immediate" | "waited" | "aborted";

let running = 0;
const waiters: Array<() => void> = [];

/** Current limit; undefined = unlimited. Read at acquire time. */
function limit(): number | undefined {
	return pickEnvNumber(process.env.PI_SUBAGENT_MAX_CONCURRENT);
}

/**
 * Acquire a slot. Resolves "immediate" if a slot is free, "waited" after
 * waiting in the FIFO queue, or "aborted" if `signal` fires while queued
 * (the waiter is removed; no slot is consumed).
 */
export function acquireSlot(signal?: AbortSignal): Promise<AcquireOutcome> {
	const lim = limit();
	if (lim === undefined || running < lim) {
		running++;
		return Promise.resolve("immediate");
	}
	return new Promise<AcquireOutcome>((resolve) => {
		let settled = false;
		const grant = () => {
			if (settled) return;
			settled = true;
			removeAbort();
			running++;
			resolve("waited");
		};
		const onAbort = () => {
			if (settled) return;
			settled = true;
			const i = waiters.indexOf(grant);
			if (i !== -1) waiters.splice(i, 1);
			removeAbort();
			resolve("aborted");
		};
		const removeAbort = () => {
			signal?.removeEventListener("abort", onAbort);
		};
		waiters.push(grant);
		if (signal) {
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

/** Release a slot and wake the next waiter, if any. */
export function releaseSlot(): void {
	running--;
	const next = waiters.shift();
	if (next) next();
}

/** Test-only: reset module state. */
export function resetQueue(): void {
	running = 0;
	waiters.length = 0;
}
