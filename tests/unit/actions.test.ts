import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { createInitialChangeState } from "../../src/core/runtime/project/templates.js";
import { deriveActions, nextActionIsAvailable } from "../../src/core/runtime/state/actions.js";

test("initial requirements state only exposes requirements drafting actions", () => {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-14T00:00:00.000Z",
    projectRevision: null,
  });
  const result = deriveActions(state, []);

  assert.deepEqual(
    result.available.map((action) => action.id),
    ["draft_requirements", "revise_requirements"],
  );
  assert.equal(
    result.blocked.find((action) => action.id === "start_implementation")?.reason,
    "design_gate_not_confirmed",
  );
  assert.equal(nextActionIsAvailable(state.next_action, result.available), true);
});

test("diagnostic errors suppress executable actions", () => {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-14T00:00:00.000Z",
    projectRevision: null,
  });
  const result = deriveActions(state, [
    {
      severity: "error",
      code: "test_error",
      path: "change.yaml",
      message: "fixture",
    },
  ]);

  assert.deepEqual(result.available, []);
  assert.equal(nextActionIsAvailable(state.next_action, result.available), false);
});
