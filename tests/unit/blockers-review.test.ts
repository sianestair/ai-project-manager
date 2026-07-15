import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { resolveBlockers } from "../../src/core/runtime/governance/blockers.js";
import { recordReviewOutcome, resolveReview } from "../../src/core/runtime/governance/review.js";
import { createInitialChangeState } from "../../src/core/runtime/project/templates.js";

function initialState() {
  return createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-15T00:00:00.000Z",
    projectRevision: null,
  });
}

test("open blockers and blocked status must remain mechanically consistent", () => {
  const state = initialState();
  state.blockers.push({
    reason: "external_permission_required",
    blocked_by: "external",
    resume_when: "The external system grants the required permission.",
    affected_stage: "implementation",
    created_at: "2026-07-15T01:00:00.000Z",
    status: "open",
  });

  const activeConflict = resolveBlockers(state);
  assert.equal(activeConflict.openBlockers.length, 1);
  assert.equal(activeConflict.diagnostics[0]?.code, "blocker_status_conflict");

  state.status = "blocked";
  assert.deepEqual(resolveBlockers(state).diagnostics, []);

  state.blockers[0]!.status = "resolved";
  assert.equal(resolveBlockers(state).diagnostics[0]?.code, "blocker_status_conflict");
});

test("review corrections append history and create non_converging blocker at the limit", () => {
  let state = initialState();
  const originalHistory = structuredClone(state.history);

  for (let index = 1; index <= state.review.max_iterations; index += 1) {
    state = recordReviewOutcome(state, {
      outcome: "changes_requested",
      at: "2026-07-15T0" + String(index) + ":00:00.000Z",
      summary: "Review correction loop " + String(index) + ".",
      blockedBy: "user",
    });
  }

  assert.deepEqual(state.history.slice(0, originalHistory.length), originalHistory);
  assert.equal(
    state.history.filter((event) => event.event === "review_changes_requested").length,
    3,
  );
  assert.equal(state.review.iteration, 3);
  assert.equal(state.status, "blocked");
  assert.equal(state.blockers.at(-1)?.reason, "non_converging");
  assert.equal(state.next_action.action, "resolve_blocker");

  const blockers = resolveBlockers(state);
  const review = resolveReview(state, blockers.openBlockers);
  assert.deepEqual([...blockers.diagnostics, ...review.diagnostics], []);
  assert.equal(review.review.at_limit, true);
  assert.equal(review.review.non_converging, true);
  assert.equal(review.review.can_continue, false);
});

test("a failed review at the limit cannot omit the non_converging blocker", () => {
  const state = initialState();
  state.review.iteration = state.review.max_iterations;
  state.review.last_outcome = "changes_requested";
  for (let index = 0; index < state.review.iteration; index += 1) {
    state.history.push({
      at: "2026-07-15T0" + String(index + 1) + ":00:00.000Z",
      event: "review_changes_requested",
      summary: "Recorded review loop.",
    });
  }

  const review = resolveReview(state, []);
  assert.equal(review.review.non_converging, true);
  assert.equal(
    review.diagnostics.some((item) => item.code === "non_converging_blocker_required"),
    true,
  );
});

test("implementation revision and checkpoint pairs follow implementation status", () => {
  const state = initialState();
  state.implementation.status = "in_progress";
  state.implementation.checkpoint.scope_digest = "a".repeat(64);

  const result = resolveReview(state, []);
  assert.deepEqual(
    result.diagnostics.map((item) => item.code),
    ["implementation_revision_conflict", "checkpoint_record_incomplete"],
  );
});
