import {
  findProjectRoot,
  locateActiveChange,
  readChangeState,
  readProjectConfig,
} from "../project/discover.js";
import { resolveMaterialSets } from "../materials/sets.js";
import { resolveConfirmations } from "../governance/confirmations.js";
import { resolveReadiness } from "../governance/readiness.js";
import { resolveSelfChecks } from "../governance/self-checks.js";
import type { Diagnostic, ResolvedChangeState } from "./types.js";
import { deriveActions, nextActionIsAvailable } from "./actions.js";
import { validateStateInvariants } from "./invariants.js";

export async function resolveCanonicalState(input: {
  project?: string;
  changeId?: string;
}): Promise<ResolvedChangeState> {
  const projectRoot = await findProjectRoot(input.project);
  const projectConfig = await readProjectConfig(projectRoot);
  const located = await locateActiveChange(projectRoot, input.changeId);
  const state = await readChangeState(located.changeDirectory);
  const materialResult = await resolveMaterialSets(located.changeDirectory, state);
  const confirmationResult = resolveConfirmations(state, materialResult.materials);
  const readinessResult = resolveReadiness(state.readiness, materialResult.materials);
  const selfCheckResult = await resolveSelfChecks(located.changeDirectory);
  const diagnostics: Diagnostic[] = [
    ...validateStateInvariants(state, located.changeId),
    ...materialResult.diagnostics,
    ...confirmationResult.diagnostics,
    ...readinessResult.diagnostics,
  ];
  const actions = deriveActions(
    state,
    {
      materials: materialResult.materials,
      gates: confirmationResult.gates,
      readiness: readinessResult.readiness,
      selfChecks: selfCheckResult.selfChecks,
      designPermission: selfCheckResult.designPermission,
    },
    diagnostics,
  );
  const nextActionValid = nextActionIsAvailable(state.next_action, actions.available);

  if (!nextActionValid) {
    diagnostics.push({
      severity: "error",
      code: "next_action_not_available",
      path: "next_action",
      message: "Persisted next_action must be one of the current available_actions.",
    });
  }

  return {
    project: {
      root: projectRoot,
      project_id: projectConfig.project_id,
      schema_version: projectConfig.schema_version,
    },
    change: {
      change_id: state.change_id,
      title: state.title,
      phase: state.phase,
      status: state.status,
      project_revision: state.base.project_revision,
    },
    materials: materialResult.materials,
    gates: confirmationResult.gates,
    readiness: readinessResult.readiness,
    self_checks: selfCheckResult.selfChecks,
    design_permission: selfCheckResult.designPermission,
    blockers: state.blockers,
    review: state.review,
    available_actions: actions.available,
    blocked_actions: actions.blocked,
    next_action: {
      ...state.next_action,
      valid: nextActionValid,
    },
    recovery: {
      current_goal: state.title,
      inputs: nextActionValid ? [...state.next_action.inputs] : [],
    },
    diagnostics,
  };
}
