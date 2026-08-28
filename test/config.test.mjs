import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { resolveSubagentConfig } from "../types.ts";

const VARS = ["PI_SUBAGENT_TIMEOUT", "PI_SUBAGENT_MAX_TURNS", "PI_SUBAGENT_CWD"];
const DEFAULTS = { timeoutMs: 600_000, maxTurns: 50, cwd: undefined };

function clearEnv() {
	for (const v of VARS) delete process.env[v];
}

test("resolveSubagentConfig returns defaults when no env is set", () => {
	clearEnv();
	assert.deepEqual(resolveSubagentConfig(), DEFAULTS);
});

test("resolveSubagentConfig applies env values", () => {
	clearEnv();
	process.env.PI_SUBAGENT_TIMEOUT = "120";
	process.env.PI_SUBAGENT_MAX_TURNS = "10";
	process.env.PI_SUBAGENT_CWD = "/tmp/work";
	try {
		assert.deepEqual(resolveSubagentConfig(), {
			timeoutMs: 120_000,
			maxTurns: 10,
			cwd: "/tmp/work",
		});
	} finally {
		clearEnv();
	}
});

test("resolveSubagentConfig falls through to defaults on invalid values", () => {
	for (const bad of ["0", "-1", "abc", ""]) {
		clearEnv();
		process.env.PI_SUBAGENT_TIMEOUT = bad;
		process.env.PI_SUBAGENT_MAX_TURNS = bad;
		// Only the empty string is invalid for a path; "0"/"-1"/"abc" are valid dirs.
		process.env.PI_SUBAGENT_CWD = "";
		assert.deepEqual(
			resolveSubagentConfig(),
			DEFAULTS,
			`invalid values ${JSON.stringify(bad)} should fall through to defaults`,
		);
	}
	clearEnv();
});

test("resolveSubagentConfig expands a leading ~ in PI_SUBAGENT_CWD", () => {
	clearEnv();
	process.env.PI_SUBAGENT_CWD = "~/subagent-work";
	try {
		const cfg = resolveSubagentConfig();
		assert.equal(cfg.cwd, path.join(os.homedir(), "subagent-work"));
	} finally {
		clearEnv();
	}
});
