import { join } from "node:path";

import { resolveBlockers } from "../governance/blockers.js";
import { resolveConfirmations } from "../governance/confirmations.js";
import { invalidateWorkflowState, invalidatedGates } from "../governance/invalidation.js";
import { resolveReadiness } from "../governance/readiness.js";
import { resolveRecoveryFacts } from "../governance/recovery.js";
import { resolveReview } from "../governance/review.js";
import { EXIT_CODES, PmError } from "../cli/errors.js";
import { findProjectRoot, locateActiveChange, readChangeState } from "../project/discover.js";
import { writeYamlAtomic } from "../project/io.js";
import { deriveActions, nextActionIsAvailable } from "../state/actions.js";
import { validateStateInvariants } from "../state/invariants.js";
import { resolveCanonicalState } from "../state/resolver.js";
import { validateChangeState } from "../state/schema.js";
import type { GateName, InvalidationStage } from "../state/types.js";

const STAGES = new Set<InvalidationStage>([
  "requirements",
  "design",
  "implementation",
  "acceptance",
  "knowledge",
]);

function readStage(value: string): InvalidationStage {
  if (STAGES.has(value as InvalidationStage)) {
    return value as InvalidationStage;
  }

  throw new PmError(
    "invalid_arguments",
    "Unknown invalidation stage: " + value + ".",
    EXIT_CODES.usage,
  );
}

function readReason(value: string): string {
  const reason = value.trim();
  if (reason === "") {
    throw new PmError(
      "invalid_arguments",
      "Invalidation reason must not be empty.",
      EXIT_CODES.usage,
    );
  }
  return reason;
}

export interface InvalidateResult {
  changeId: string;
  stage: InvalidationStage;
  reason: string;
  invalidatedAt: string;
  invalidatedGates: readonly GateName[];
  phase: string;
  status: string;
  nextAction: string;
}

export async function invalidateChange(
  input: {
    project?: string;
    changeId: string;
    stage: string;
    reason: string;
  },
  now: () => string = () => new Date().toISOString(),
): Promise<InvalidateResult> {
  const stage = readStage(input.stage);
  const reason = readReason(input.reason);
  const projectRoot = await findProjectRoot(input.project);
  const located = await locateActiveChange(projectRoot, input.changeId);
  const resolved = await resolveCanonicalState({
    project: projectRoot,
    changeId: located.changeId,
  });
  const actionId = "invalidate_" + stage;
  if (!resolved.available_actions.some((action) => action.id === actionId)) {
    throw new PmError(
      "invalidation_blocked",
      "The " + stage + " stage cannot be invalidated in the current state.",
      EXIT_CODES.blocked,
      ["action_not_available"],
    );
  }

  const state = await readChangeState(located.changeDirectory);
  if (
    state.knowledge_promotion.status === "applied" ||
    state.knowledge_promotion.status === "verified"
  ) {
    throw new PmError(
      "invalidation_blocked",
      "Applied project knowledge cannot be hidden by workflow invalidation.",
      EXIT_CODES.blocked,
      ["knowledge_already_applied"],
    );
  }

  const invalidatedAt = now();
  const nextState = invalidateWorkflowState(state, {
    stage,
    reason,
    invalidatedAt,
    requiresReassessment: resolved.recovery.requires_reassessment,
  });
  await validateChangeState(nextState);

  const confirmationResult = resolveConfirmations(nextState, resolved.materials);
  const readinessResult = resolveReadiness(nextState.readiness, resolved.materials);
  const blockerResult = resolveBlockers(nextState);
  const reviewResult = resolveReview(nextState, blockerResult.openBlockers);
  const confirmedGates = (Object.keys(confirmationResult.gates) as GateName[]).filter(
    (gateName) => confirmationResult.gates[gateName].valid,
  );
  const recoveryResult = await resolveRecoveryFacts({
    projectRoot,
    state: nextState,
    confirmedGates,
  });
  const predictedDiagnostics = [
    ...validateStateInvariants(nextState, located.changeId),
    ...confirmationResult.diagnostics,
    ...readinessResult.diagnostics,
    ...blockerResult.diagnostics,
    ...reviewResult.diagnostics,
    ...recoveryResult.diagnostics,
  ];
  const predictedActions = deriveActions(
    nextState,
    {
      materials: resolved.materials,
      gates: confirmationResult.gates,
      readiness: readinessResult.readiness,
      selfChecks: resolved.self_checks,
      designPermission: resolved.design_permission,
      openBlockers: blockerResult.openBlockers,
      review: reviewResult.review,
      recovery: recoveryResult.recovery,
      traceability: resolved.traceability,
      tasks: resolved.tasks,
      verification: resolved.verification,
    },
    predictedDiagnostics,
  );

  if (
    predictedDiagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    !nextActionIsAvailable(nextState.next_action, predictedActions.available)
  ) {
    throw new PmError(
      "invalidation_transition_invalid",
      "Invalidation would produce an invalid workflow state.",
      EXIT_CODES.internal,
      predictedDiagnostics.map((diagnostic) => diagnostic.code),
    );
  }

  await writeYamlAtomic(join(located.changeDirectory, "change.yaml"), nextState);

  return {
    changeId: located.changeId,
    stage,
    reason,
    invalidatedAt,
    invalidatedGates: invalidatedGates(stage),
    phase: nextState.phase,
    status: nextState.status,
    nextAction: nextState.next_action.action,
  };
}
