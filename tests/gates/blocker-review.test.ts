import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test } from "vite-plus/test";
import { parse, stringify } from "yaml";

import type { ChangeState } from "../../src/core/runtime/state/types.js";

const cliPath = resolve("dist/bin/pm.js");

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

test("non-converging review state exposes only blocker resolution and rollback actions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-non-converging-"));
  const changeId = "review-limit";
  const changePath = join(projectRoot, "changes", "active", changeId, "change.yaml");

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "review-limit"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);
    const state = parse(await readFile(changePath, "utf8")) as ChangeState;
    state.status = "blocked";
    state.review.iteration = state.review.max_iterations;
    state.review.last_outcome = "changes_requested";
    for (let index = 0; index < state.review.iteration; index += 1) {
      state.history.push({
        at: "2026-07-15T0" + String(index + 1) + ":00:00.000Z",
        event: "review_changes_requested",
        summary: "Review correction loop " + String(index + 1) + ".",
      });
    }
    state.blockers.push({
      reason: "non_converging",
      blocked_by: "user",
      resume_when: "The user decides whether to change scope or roll back.",
      affected_stage: "implementation",
      created_at: "2026-07-15T04:00:00.000Z",
      status: "open",
    });
    state.next_action = {
      owner: "user",
      action: "resolve_blocker",
      inputs: ["change.yaml"],
    };
    await writeFile(changePath, stringify(state, { lineWidth: 0 }), "utf8");

    const result = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.review.non_converging, true);
    assert.equal(value.review.can_continue, false);
    assert.equal(value.open_blockers[0].reason, "non_converging");
    assert.deepEqual(
      value.available_actions.map((action: { id: string }) => action.id),
      ["resolve_blocker"],
    );
    assert.equal(
      value.blocked_actions.some(
        (action: { id: string; reason: string }) =>
          action.id === "continue_implementation" && action.reason === "non_converging",
      ),
      true,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("review limit without a non_converging blocker is an expected failure state", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-missing-non-converging-"));
  const changeId = "missing-review-blocker";
  const changePath = join(projectRoot, "changes", "active", changeId, "change.yaml");

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "missing-review-blocker"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);
    const state = parse(await readFile(changePath, "utf8")) as ChangeState;
    state.review.iteration = state.review.max_iterations;
    state.review.last_outcome = "changes_requested";
    for (let index = 0; index < state.review.iteration; index += 1) {
      state.history.push({
        at: "2026-07-15T0" + String(index + 1) + ":00:00.000Z",
        event: "review_changes_requested",
        summary: "Review correction loop.",
      });
    }
    state.next_action = {
      owner: "ai_project_manager",
      action: "record_blocker",
      inputs: ["change.yaml"],
    };
    await writeFile(changePath, stringify(state, { lineWidth: 0 }), "utf8");

    const result = runCli(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(result.status, 3);
    const value = JSON.parse(result.stdout);
    assert.equal(
      value.state.diagnostics.some(
        (item: { code: string }) => item.code === "non_converging_blocker_required",
      ),
      true,
    );
    assert.equal(
      value.state.available_actions.some(
        (action: { id: string }) => action.id === "record_blocker",
      ),
      true,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
