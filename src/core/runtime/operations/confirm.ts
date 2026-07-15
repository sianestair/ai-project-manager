import { join } from "node:path";

import {
  appendConfirmation,
  confirmationAuthorityReason,
  resolveConfirmations,
} from "../governance/confirmations.js";
import { resolveReadiness } from "../governance/readiness.js";
import { EXIT_CODES, PmError } from "../cli/errors.js";
import { findProjectRoot, locateActiveChange, readChangeState } from "../project/discover.js";
import { writeYamlAtomic } from "../project/io.js";
import { deriveActions, nextActionIsAvailable } from "../state/actions.js";
import { validateStateInvariants } from "../state/invariants.js";
import { resolveCanonicalState } from "../state/resolver.js";
import { validateChangeState } from "../state/schema.js";
import type { ConfirmationActor, GateName } from "../state/types.js";

const GATES = new Set<GateName>(["requirements", "design", "acceptance", "knowledge"]);
const ACTORS = new Set<ConfirmationActor>(["user", "ai_project_manager"]);

function readGate(value: string): GateName {
  if (GATES.has(value as GateName)) {
    return value as GateName;
  }

  throw new PmError(
    "invalid_arguments",
    "Unknown confirmation gate: " + value + ".",
    EXIT_CODES.usage,
  );
}

function readActor(value: string): ConfirmationActor {
  if (ACTORS.has(value as ConfirmationActor)) {
    return value as ConfirmationActor;
  }

  throw new PmError(
    "invalid_arguments",
    "Unknown confirmation actor: " + value + ".",
    EXIT_CODES.usage,
  );
}

function requireMetadata(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new PmError(
      "invalid_arguments",
      "Confirmation " + field + " must not be empty.",
      EXIT_CODES.usage,
    );
  }

  return normalized;
}

function confirmationAction(gate: GateName): string {
  return "confirm_" + gate;
}

export interface ConfirmResult {
  changeId: string;
  gate: GateName;
  revision: number;
  confirmedBy: ConfirmationActor;
  confirmedAt: string;
  artifacts: Array<{ path: string; digest: string }>;
  phase: string;
  nextAction: string;
}

export async function confirmChange(
  input: {
    project?: string;
    changeId: string;
    gate: string;
    confirmedBy: string;
    summary: string;
    evidence: string;
  },
  now: () => string = () => new Date().toISOString(),
): Promise<ConfirmResult> {
  const gate = readGate(input.gate);
  const confirmedBy = readActor(input.confirmedBy);
  const summary = requireMetadata(input.summary, "summary");
  const evidence = requireMetadata(input.evidence, "evidence");
  const projectRoot = await findProjectRoot(input.project);
  const located = await locateActiveChange(projectRoot, input.changeId);
  const resolved = await resolveCanonicalState({
    project: projectRoot,
    changeId: located.changeId,
  });
  const actionId = confirmationAction(gate);
  const actionAvailable = resolved.available_actions.some((action) => action.id === actionId);

  if (!actionAvailable) {
    const blocked = resolved.blocked_actions.find((action) => action.id === actionId);
    throw new PmError(
      "confirmation_blocked",
      "The " + gate + " gate cannot be confirmed in the current state.",
      EXIT_CODES.blocked,
      blocked === undefined
        ? ["action_not_available"]
        : [
            blocked.reason,
            "blocked_by: " + blocked.blocked_by,
            "resume_when: " + blocked.resume_when,
          ],
    );
  }

  const authorityReason = confirmationAuthorityReason({
    gate,
    confirmedBy,
    designPermission: resolved.design_permission,
    readiness: resolved.readiness,
  });
  if (authorityReason !== null) {
    throw new PmError(
      "confirmation_authority_blocked",
      "The requested confirmer is not authorized for the " + gate + " gate.",
      EXIT_CODES.blocked,
      [authorityReason],
    );
  }

  const resolvedGate = resolved.gates[gate];
  const material = resolved.materials[resolvedGate.material_set];
  if (material.digest === null || material.artifacts.length === 0) {
    throw new PmError(
      "confirmation_materials_incomplete",
      "The " + gate + " confirmation material set is incomplete.",
      EXIT_CODES.blocked,
    );
  }

  const confirmedAt = now();
  const state = await readChangeState(located.changeDirectory);
  const nextState = appendConfirmation(state, {
    gate,
    revision: resolvedGate.next_revision,
    artifacts: material.artifacts,
    confirmedBy,
    confirmedAt,
    summary,
    evidence,
  });

  await validateChangeState(nextState);
  const confirmationResult = resolveConfirmations(nextState, resolved.materials);
  const readinessResult = resolveReadiness(nextState.readiness, resolved.materials);
  const predictedDiagnostics = [
    ...validateStateInvariants(nextState, located.changeId),
    ...confirmationResult.diagnostics,
    ...readinessResult.diagnostics,
  ];
  const predictedActions = deriveActions(
    nextState,
    {
      materials: resolved.materials,
      gates: confirmationResult.gates,
      readiness: readinessResult.readiness,
      selfChecks: resolved.self_checks,
      designPermission: resolved.design_permission,
    },
    predictedDiagnostics,
  );

  if (
    predictedDiagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    !nextActionIsAvailable(nextState.next_action, predictedActions.available)
  ) {
    throw new PmError(
      "confirmation_transition_invalid",
      "Confirmation would produce an invalid workflow state.",
      EXIT_CODES.internal,
      predictedDiagnostics.map((diagnostic) => diagnostic.code),
    );
  }

  await writeYamlAtomic(join(located.changeDirectory, "change.yaml"), nextState);

  return {
    changeId: located.changeId,
    gate,
    revision: resolvedGate.next_revision,
    confirmedBy,
    confirmedAt,
    artifacts: material.artifacts.map((artifact) => ({ ...artifact })),
    phase: nextState.phase,
    nextAction: nextState.next_action.action,
  };
}
