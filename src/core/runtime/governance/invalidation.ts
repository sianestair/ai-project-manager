import { blockerActionOwner } from "./blockers.js";
import type { ChangeState, GateName, InvalidationStage, NextAction } from "../state/types.js";

const INVALIDATED_GATES: Record<InvalidationStage, readonly GateName[]> = {
  requirements: ["requirements", "design", "acceptance", "knowledge"],
  design: ["design", "acceptance", "knowledge"],
  implementation: ["acceptance", "knowledge"],
  acceptance: ["acceptance", "knowledge"],
  knowledge: ["knowledge"],
};

const NEXT_ACTIONS: Record<InvalidationStage, NextAction> = {
  requirements: {
    owner: "ai_project_manager",
    action: "revise_requirements",
    inputs: ["requirements.md"],
  },
  design: {
    owner: "ai_project_manager",
    action: "revise_design",
    inputs: ["design/README.md"],
  },
  implementation: {
    owner: "ai_project_manager",
    action: "continue_implementation",
    inputs: ["delivery/README.md"],
  },
  acceptance: {
    owner: "ai_project_manager",
    action: "prepare_acceptance",
    inputs: ["delivery/README.md"],
  },
  knowledge: {
    owner: "ai_project_manager",
    action: "draft_knowledge_update",
    inputs: ["knowledge-update.md"],
  },
};

export function invalidatedGates(stage: InvalidationStage): readonly GateName[] {
  return INVALIDATED_GATES[stage];
}

export function invalidateWorkflowState(
  state: ChangeState,
  input: {
    stage: InvalidationStage;
    reason: string;
    invalidatedAt: string;
    requiresReassessment?: boolean;
  },
): ChangeState {
  const next = structuredClone(state);
  const gates = invalidatedGates(input.stage);
  for (const gateName of gates) {
    next.gates[gateName].status = "invalidated";
  }

  next.phase = input.stage;

  if (input.stage === "requirements" || input.stage === "design") {
    if (next.readiness.status !== "not_assessed") {
      next.readiness.status = "stale";
    }
    next.implementation = {
      status: "not_started",
      baseline_revision: null,
      final_revision: null,
      checkpoint: {
        scope_digest: null,
        captured_at: null,
      },
    };
  } else if (input.stage === "implementation") {
    next.implementation.status = "in_progress";
    next.implementation.final_revision = null;
  }

  if (
    input.stage === "requirements" ||
    input.stage === "design" ||
    input.stage === "implementation"
  ) {
    next.review = {
      iteration: 0,
      max_iterations: next.review.max_iterations,
      last_outcome: null,
    };
    for (const blocker of next.blockers) {
      if (blocker.status === "open" && blocker.reason === "non_converging") {
        blocker.status = "resolved";
      }
    }
  }

  next.knowledge_promotion = {
    status: "not_started",
    candidate_digest: null,
    patch_digest: null,
    targets: [],
    applied_files: [],
  };

  const firstOpenBlocker = next.blockers.find((blocker) => blocker.status === "open");
  if (firstOpenBlocker !== undefined) {
    next.status = "blocked";
    next.next_action = {
      owner: blockerActionOwner(firstOpenBlocker.blocked_by),
      action: "resolve_blocker",
      inputs: ["change.yaml"],
    };
  } else {
    next.status = "active";
    next.next_action = input.requiresReassessment
      ? {
          owner: "ai_project_manager",
          action: "reassess_dependency_drift",
          inputs: ["change.yaml"],
        }
      : structuredClone(NEXT_ACTIONS[input.stage]);
  }

  next.history.push({
    at: input.invalidatedAt,
    event: input.stage + "_invalidated",
    summary:
      "Invalidated " +
      input.stage +
      " and downstream workflow state (gates: " +
      gates.join(", ") +
      "): " +
      input.reason,
  });

  return next;
}
