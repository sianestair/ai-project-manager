import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { invalidateWorkflowState } from "../../src/core/runtime/governance/invalidation.js";
import { createInitialChangeState } from "../../src/core/runtime/project/templates.js";
import type { ChangeState, GateName } from "../../src/core/runtime/state/types.js";

const DIGEST = "a".repeat(64);

function advancedState(): ChangeState {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-15T00:00:00.000Z",
    projectRevision: "baseline",
  });
  const materialPaths: Record<GateName, string> = {
    requirements: "requirements.md",
    design: "design/README.md",
    acceptance: "delivery/README.md",
    knowledge: "knowledge-update.md",
  };

  for (const [gateName, path] of Object.entries(materialPaths) as Array<[GateName, string]>) {
    state.gates[gateName].status = "confirmed";
    state.gates[gateName].confirmations.push({
      revision: 1,
      artifacts: [{ path, digest: DIGEST }],
      confirmed_by: gateName === "design" ? "ai_project_manager" : "user",
      confirmed_at: "2026-07-15T01:00:00.000Z",
      summary: "Confirmed baseline.",
      evidence: "Explicit confirmation evidence.",
    });
  }

  state.phase = "knowledge";
  state.readiness = {
    status: "pass",
    assessed_artifacts: [{ path: "requirements.md", digest: DIGEST }],
    concerns: [],
    assessed_at: "2026-07-15T01:30:00.000Z",
  };
  state.implementation = {
    status: "verified",
    baseline_revision: "baseline",
    final_revision: "final",
    checkpoint: {
      scope_digest: DIGEST,
      captured_at: "2026-07-15T02:00:00.000Z",
    },
  };
  state.review.iteration = 1;
  state.review.last_outcome = "passed";
  state.history.push({
    at: "2026-07-15T02:30:00.000Z",
    event: "review_changes_requested",
    summary: "Historical review correction remains append-only.",
  });
  state.knowledge_promotion.status = "ready";
  state.knowledge_promotion.candidate_digest = DIGEST;
  state.knowledge_promotion.patch_digest = DIGEST;
  return state;
}

test("requirements invalidation resets every downstream current pointer without deleting history", () => {
  const state = advancedState();
  const confirmationCounts = Object.fromEntries(
    (Object.keys(state.gates) as GateName[]).map((gateName) => [
      gateName,
      state.gates[gateName].confirmations.length,
    ]),
  );
  const historyLength = state.history.length;
  const next = invalidateWorkflowState(state, {
    stage: "requirements",
    reason: "The product scope changed.",
    invalidatedAt: "2026-07-15T03:00:00.000Z",
  });

  assert.equal(next.phase, "requirements");
  assert.deepEqual(
    Object.values(next.gates).map((gate) => gate.status),
    ["invalidated", "invalidated", "invalidated", "invalidated"],
  );
  assert.deepEqual(
    Object.fromEntries(
      (Object.keys(next.gates) as GateName[]).map((gateName) => [
        gateName,
        next.gates[gateName].confirmations.length,
      ]),
    ),
    confirmationCounts,
  );
  assert.equal(next.readiness.status, "stale");
  assert.equal(next.implementation.status, "not_started");
  assert.equal(next.implementation.baseline_revision, null);
  assert.equal(next.review.iteration, 0);
  assert.equal(next.knowledge_promotion.status, "not_started");
  assert.equal(next.history.length, historyLength + 1);
  assert.equal(next.next_action.action, "revise_requirements");
});

test("design invalidation preserves requirements confirmation and invalidates downstream gates", () => {
  const next = invalidateWorkflowState(advancedState(), {
    stage: "design",
    reason: "The selected design is no longer feasible.",
    invalidatedAt: "2026-07-15T03:00:00.000Z",
  });

  assert.equal(next.gates.requirements.status, "confirmed");
  assert.equal(next.gates.design.status, "invalidated");
  assert.equal(next.gates.acceptance.status, "invalidated");
  assert.equal(next.gates.knowledge.status, "invalidated");
  assert.equal(next.phase, "design");
  assert.equal(next.next_action.action, "revise_design");
});

test("implementation invalidation preserves upstream gates and readiness", () => {
  const state = advancedState();
  const readiness = structuredClone(state.readiness);
  const next = invalidateWorkflowState(state, {
    stage: "implementation",
    reason: "Acceptance found a local implementation defect.",
    invalidatedAt: "2026-07-15T03:00:00.000Z",
  });

  assert.equal(next.gates.requirements.status, "confirmed");
  assert.equal(next.gates.design.status, "confirmed");
  assert.equal(next.gates.acceptance.status, "invalidated");
  assert.deepEqual(next.readiness, readiness);
  assert.equal(next.implementation.status, "in_progress");
  assert.equal(next.implementation.baseline_revision, "baseline");
  assert.equal(next.implementation.final_revision, null);
  assert.equal(next.next_action.action, "continue_implementation");
});

test("knowledge invalidation leaves accepted delivery and implementation untouched", () => {
  const state = advancedState();
  const implementation = structuredClone(state.implementation);
  const next = invalidateWorkflowState(state, {
    stage: "knowledge",
    reason: "Candidate knowledge wording needs revision.",
    invalidatedAt: "2026-07-15T03:00:00.000Z",
  });

  assert.equal(next.gates.acceptance.status, "confirmed");
  assert.equal(next.gates.knowledge.status, "invalidated");
  assert.deepEqual(next.implementation, implementation);
  assert.equal(next.phase, "knowledge");
  assert.equal(next.next_action.action, "draft_knowledge_update");
});

test("explicit implementation rollback resolves the current non-converging loop but keeps its history", () => {
  const state = advancedState();
  state.phase = "implementation";
  state.status = "blocked";
  state.implementation.status = "in_progress";
  state.implementation.final_revision = null;
  state.review.iteration = state.review.max_iterations;
  state.review.last_outcome = "changes_requested";
  while (
    state.history.filter((event) => event.event === "review_changes_requested").length <
    state.review.iteration
  ) {
    state.history.push({
      at: "2026-07-15T02:45:00.000Z",
      event: "review_changes_requested",
      summary: "Historical review correction.",
    });
  }
  state.blockers.push({
    reason: "non_converging",
    blocked_by: "user",
    resume_when: "The user chooses an explicit rollback stage.",
    affected_stage: "implementation",
    created_at: "2026-07-15T02:50:00.000Z",
    status: "open",
  });
  const historyLength = state.history.length;

  const next = invalidateWorkflowState(state, {
    stage: "implementation",
    reason: "The user chose a new implementation pass.",
    invalidatedAt: "2026-07-15T03:00:00.000Z",
  });

  assert.equal(next.blockers.at(-1)?.status, "resolved");
  assert.equal(next.status, "active");
  assert.equal(next.review.iteration, 0);
  assert.equal(next.review.last_outcome, null);
  assert.equal(next.history.length, historyLength + 1);
  assert.equal(next.next_action.action, "continue_implementation");
});
