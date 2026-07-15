import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { createInitialChangeState } from "../../src/core/runtime/project/templates.js";
import {
  deriveActions,
  nextActionIsAvailable,
  type ActionContext,
} from "../../src/core/runtime/state/actions.js";
import type {
  ChangeState,
  DesignPermissionFact,
  GateName,
  MaterialSetName,
  ResolvedGate,
  ResolvedMaterialSet,
  SelfCheckFact,
} from "../../src/core/runtime/state/types.js";

const DIGEST = "a".repeat(64);

function fact(path: string, section: string): SelfCheckFact {
  return { path, section, complete: false, reason: "placeholder_present" };
}

function permissionFact(): DesignPermissionFact {
  return {
    path: "design/README.md",
    section: "权限分类",
    complete: false,
    reason: "authority_missing",
    authority: null,
  };
}

function actionContext(state: ChangeState): ActionContext {
  const materialPaths: Record<MaterialSetName, string> = {
    requirements: "requirements.md",
    design: "design/README.md",
    delivery: "delivery/README.md",
    knowledge: "knowledge-update.md",
  };
  const materials = Object.fromEntries(
    (Object.entries(materialPaths) as Array<[MaterialSetName, string]>).map(([name, path]) => [
      name,
      {
        name,
        artifacts: [{ path, digest: DIGEST }],
        digest: DIGEST,
      } satisfies ResolvedMaterialSet,
    ]),
  ) as Record<MaterialSetName, ResolvedMaterialSet>;
  const resolvedGate = (name: GateName): ResolvedGate => ({
    status: state.gates[name].status,
    persisted_status: state.gates[name].status,
    material_set: state.gates[name].material_set,
    confirmations: [],
    current_confirmation: null,
    valid: false,
    next_revision: 1,
    invalid_reason: null,
  });
  const gates: Record<GateName, ResolvedGate> = {
    requirements: resolvedGate("requirements"),
    design: resolvedGate("design"),
    acceptance: resolvedGate("acceptance"),
    knowledge: resolvedGate("knowledge"),
  };

  return {
    materials,
    gates,
    readiness: {
      ...state.readiness,
      persisted_status: state.readiness.status,
      fresh: false,
      ready: false,
      invalid_reason: "not_assessed",
    },
    selfChecks: {
      requirements: fact("requirements.md", "需求门前自检"),
      design: fact("design/README.md", "设计门前自检"),
      acceptance: fact("delivery/README.md", "验收门前自检"),
      knowledge: fact("knowledge-update.md", "知识门前自检"),
    },
    designPermission: permissionFact(),
    openBlockers: [],
    review: {
      ...state.review,
      at_limit: false,
      non_converging: false,
      can_continue: true,
    },
    recovery: {
      current_goal: state.title,
      inputs: [],
      confirmed_gates: [],
      requires_reassessment: false,
      dependency_drift: [],
      checkpoint: {
        recorded_scope_digest: null,
        current_scope_digest: null,
        recorded_at: null,
        status: "not_recorded",
      },
      workspace: {
        git_available: false,
        base_revision: state.base.project_revision,
        current_revision: null,
        changes: [],
      },
      resume_conditions: [],
    },
    traceability: {
      requirements_ready: true,
      design_ready: true,
      design_scope_ready: true,
      knowledge_ready: false,
      uncovered_requirements_by_design: [],
      dangling_references: [],
      duplicate_ids: [],
    },
    tasks: {
      records: [],
      ready: true,
      all_completed: false,
      uncovered_requirements: [],
      uncovered_design: [],
      uncovered_acceptance: [],
    },
    verification: {
      dimensions: [],
      evidence: [],
      structurally_complete: false,
      evidence_fresh: false,
      traceability_complete: false,
      ready_for_acceptance: false,
    },
    knowledgePromotion: {
      status: "not_started",
      candidate_current: false,
      patch_current: false,
      targets_current: false,
      no_change: false,
      ready_for_confirmation: false,
      ready_to_apply: false,
      verified: false,
      conflicts: [],
    },
    transaction: {
      status: "none",
      operation: null,
      path: null,
      completed_targets: 0,
      total_targets: 0,
      recovery_actions: [],
    },
    archiveReadiness: {
      ready: false,
      unmet_conditions: ["phase_not_archive_ready"],
    },
  };
}

test("initial requirements state only exposes requirements drafting actions", () => {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-14T00:00:00.000Z",
    projectRevision: null,
  });
  const result = deriveActions(state, actionContext(state), []);

  assert.deepEqual(
    result.available.map((action) => action.id),
    ["draft_requirements", "revise_requirements"],
  );
  assert.equal(
    result.blocked.find((action) => action.id === "start_implementation")?.reason,
    "requirements_gate_not_confirmed",
  );
  assert.equal(nextActionIsAvailable(state.next_action, result.available), true);
});

test("a recorded requirements self-check exposes request and confirm actions", () => {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-14T00:00:00.000Z",
    projectRevision: null,
  });
  const context = actionContext(state);
  context.selfChecks.requirements = {
    ...context.selfChecks.requirements,
    complete: true,
    reason: null,
  };
  const result = deriveActions(state, context, []);

  assert.deepEqual(
    result.available.map((action) => action.id),
    [
      "draft_requirements",
      "revise_requirements",
      "request_requirements_confirmation",
      "confirm_requirements",
    ],
  );
});

test("diagnostic errors suppress executable actions", () => {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-14T00:00:00.000Z",
    projectRevision: null,
  });
  const result = deriveActions(state, actionContext(state), [
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

test("an open blocker exposes resolution and applicable rollback instead of workflow progress", () => {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-15T00:00:00.000Z",
    projectRevision: null,
  });
  state.phase = "implementation";
  state.status = "blocked";
  state.gates.requirements.status = "confirmed";
  state.gates.design.status = "confirmed";
  state.implementation.status = "in_progress";
  state.implementation.baseline_revision = "baseline";
  const context = actionContext(state);
  context.openBlockers = [
    {
      reason: "non_converging",
      blocked_by: "user",
      resume_when: "The user decides whether to roll back.",
      affected_stage: "implementation",
      created_at: "2026-07-15T01:00:00.000Z",
      status: "open",
    },
  ];

  const result = deriveActions(state, context, []);
  assert.deepEqual(
    result.available.map((action) => action.id),
    [
      "resolve_blocker",
      "invalidate_requirements",
      "invalidate_design",
      "invalidate_implementation",
    ],
  );
  assert.equal(result.available[0]?.owner, "user");
  assert.equal(
    result.available.some((action) => action.id === "continue_implementation"),
    false,
  );
});

test("registered dependency drift requires reassessment before implementation continues", () => {
  const state = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-15T00:00:00.000Z",
    projectRevision: null,
  });
  state.phase = "implementation";
  state.gates.requirements.status = "confirmed";
  state.gates.design.status = "confirmed";
  state.implementation.status = "in_progress";
  state.implementation.baseline_revision = "baseline";
  const context = actionContext(state);
  context.recovery.requires_reassessment = true;

  const result = deriveActions(state, context, []);
  assert.equal(result.available[0]?.id, "reassess_dependency_drift");
  assert.equal(
    result.blocked.find((action) => action.id === "continue_implementation")?.reason,
    "dependency_drift_pending_reassessment",
  );
});
