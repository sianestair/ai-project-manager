import {
  findProjectRoot,
  locateActiveChange,
  readChangeState,
  readProjectConfig,
} from "../project/discover.js";
import { resolveMaterialSets } from "../materials/sets.js";
import { resolveArtifactIndex } from "../materials/markdown-contract.js";
import { resolveConfirmations } from "../governance/confirmations.js";
import { resolveBlockers } from "../governance/blockers.js";
import { requiredContractDiagnostics } from "../governance/contracts.js";
import { resolveReadiness } from "../governance/readiness.js";
import { resolveRecoveryFacts } from "../governance/recovery.js";
import { resolveReview } from "../governance/review.js";
import { resolveSelfChecks } from "../governance/self-checks.js";
import { resolveTaskContracts } from "../governance/tasks.js";
import { resolveTraceability } from "../governance/traceability.js";
import { resolveVerification } from "../governance/verification.js";
import type { Diagnostic, GateName, ResolvedChangeState } from "./types.js";
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
  const artifactResult = await resolveArtifactIndex(
    located.changeDirectory,
    materialResult.materials,
  );
  const traceabilityResult = resolveTraceability(artifactResult.index);
  const taskResult = resolveTaskContracts(artifactResult.index);
  const confirmationResult = resolveConfirmations(state, materialResult.materials);
  const readinessResult = resolveReadiness(state.readiness, materialResult.materials);
  const selfCheckResult = await resolveSelfChecks(located.changeDirectory);
  const blockerResult = resolveBlockers(state);
  const reviewResult = resolveReview(state, blockerResult.openBlockers);
  const confirmedGates = (Object.keys(confirmationResult.gates) as GateName[]).filter(
    (gateName) => confirmationResult.gates[gateName].valid,
  );
  const recoveryResult = await resolveRecoveryFacts({
    projectRoot,
    state,
    confirmedGates,
  });
  const verificationResult = resolveVerification({
    index: artifactResult.index,
    tasks: taskResult.facts,
    state,
    currentRevision: recoveryResult.recovery.workspace.current_revision,
  });
  const diagnostics: Diagnostic[] = [
    ...validateStateInvariants(state, located.changeId),
    ...materialResult.diagnostics,
    ...artifactResult.diagnostics,
    ...traceabilityResult.diagnostics,
    ...taskResult.diagnostics,
    ...verificationResult.diagnostics,
    ...requiredContractDiagnostics({
      state,
      traceability: traceabilityResult,
      tasks: taskResult,
      verification: verificationResult,
    }),
    ...confirmationResult.diagnostics,
    ...readinessResult.diagnostics,
    ...blockerResult.diagnostics,
    ...reviewResult.diagnostics,
    ...recoveryResult.diagnostics,
  ];
  const actions = deriveActions(
    state,
    {
      materials: materialResult.materials,
      gates: confirmationResult.gates,
      readiness: readinessResult.readiness,
      selfChecks: selfCheckResult.selfChecks,
      designPermission: selfCheckResult.designPermission,
      openBlockers: blockerResult.openBlockers,
      review: reviewResult.review,
      recovery: recoveryResult.recovery,
      traceability: traceabilityResult.facts,
      tasks: taskResult.facts,
      verification: verificationResult.facts,
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
    blockers: blockerResult.blockers,
    open_blockers: blockerResult.openBlockers,
    review: reviewResult.review,
    implementation: structuredClone(state.implementation),
    artifact_index: artifactResult.index,
    traceability: traceabilityResult.facts,
    tasks: taskResult.facts,
    verification: verificationResult.facts,
    available_actions: actions.available,
    blocked_actions: actions.blocked,
    next_action: {
      ...state.next_action,
      valid: nextActionValid,
    },
    recovery: {
      ...recoveryResult.recovery,
      inputs: nextActionValid ? [...state.next_action.inputs] : [],
      resume_conditions: [
        ...recoveryResult.recovery.resume_conditions,
        ...blockerResult.openBlockers.map((blocker) => blocker.resume_when),
      ].filter((condition, index, values) => values.indexOf(condition) === index),
    },
    diagnostics,
  };
}
