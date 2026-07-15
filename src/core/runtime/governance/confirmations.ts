import {
  artifactListIsCanonical,
  artifactPathsAreUnique,
  artifactSetsEqual,
  canonicalArtifacts,
  changedArtifactPaths,
} from "./artifacts.js";
import type {
  ArtifactDigest,
  ChangeState,
  ConfirmationActor,
  DesignPermissionFact,
  Diagnostic,
  GateName,
  ResolvedGate,
  ResolvedMaterialSet,
  ResolvedReadiness,
} from "../state/types.js";

const GATE_NAMES: readonly GateName[] = ["requirements", "design", "acceptance", "knowledge"];

function diagnostic(
  severity: Diagnostic["severity"],
  code: string,
  path: string,
  message: string,
): Diagnostic {
  return { severity, code, path, message };
}

export function resolveConfirmations(
  state: ChangeState,
  materials: Record<ChangeState["gates"][GateName]["material_set"], ResolvedMaterialSet>,
): {
  gates: Record<GateName, ResolvedGate>;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const entries = GATE_NAMES.map((gateName) => {
    const gate = state.gates[gateName];
    const currentArtifacts = materials[gate.material_set].artifacts;
    let recordsValid = true;

    for (const [index, confirmation] of gate.confirmations.entries()) {
      const confirmationPath = "gates." + gateName + ".confirmations[" + String(index) + "]";
      if (confirmation.revision !== index + 1) {
        recordsValid = false;
        diagnostics.push(
          diagnostic(
            "error",
            "confirmation_revision_not_sequential",
            confirmationPath + ".revision",
            "Confirmation revisions must be append-only and sequential starting at 1.",
          ),
        );
      }

      if (!artifactPathsAreUnique(confirmation.artifacts)) {
        recordsValid = false;
        diagnostics.push(
          diagnostic(
            "error",
            "confirmation_artifact_duplicate",
            confirmationPath + ".artifacts",
            "A confirmation may bind each artifact path only once.",
          ),
        );
      }

      if (!artifactListIsCanonical(confirmation.artifacts)) {
        recordsValid = false;
        diagnostics.push(
          diagnostic(
            "error",
            "confirmation_artifacts_not_canonical",
            confirmationPath + ".artifacts",
            "Confirmation artifacts must be sorted by canonical path.",
          ),
        );
      }
    }

    const currentConfirmation = gate.confirmations.at(-1) ?? null;
    const materialComplete = materials[gate.material_set].digest !== null;
    const artifactsMatch =
      currentConfirmation !== null &&
      materialComplete &&
      artifactSetsEqual(currentConfirmation.artifacts, currentArtifacts);
    let status = gate.status;
    let invalidReason: string | null = null;

    if (gate.status === "confirmed" && (!recordsValid || !artifactsMatch)) {
      status = "invalidated";
      invalidReason = recordsValid ? "material_set_changed" : "confirmation_record_invalid";

      if (recordsValid && currentConfirmation !== null) {
        const changedPaths = changedArtifactPaths(currentConfirmation.artifacts, currentArtifacts);
        diagnostics.push(
          diagnostic(
            "warning",
            "confirmation_stale",
            "gates." + gateName,
            "The confirmed " +
              gateName +
              " material set changed" +
              (changedPaths.length === 0 ? "." : ": " + changedPaths.join(", ") + "."),
          ),
        );
      }
    }

    const resolved: ResolvedGate = {
      status,
      persisted_status: gate.status,
      material_set: gate.material_set,
      confirmations: gate.confirmations.map((confirmation) => ({
        ...confirmation,
        artifacts: canonicalArtifacts(confirmation.artifacts),
      })),
      current_confirmation: currentConfirmation,
      valid: status === "confirmed" && recordsValid && artifactsMatch,
      next_revision: gate.confirmations.length + 1,
      invalid_reason: invalidReason,
    };

    return [gateName, resolved] as const;
  });

  return {
    gates: Object.fromEntries(entries) as Record<GateName, ResolvedGate>,
    diagnostics,
  };
}

export function confirmationAuthorityReason(input: {
  gate: GateName;
  confirmedBy: ConfirmationActor;
  designPermission: DesignPermissionFact;
  readiness: ResolvedReadiness;
}): string | null {
  if (input.gate !== "design" && input.confirmedBy !== "user") {
    return input.gate + "_confirmation_requires_user";
  }

  if (input.gate !== "design") {
    return null;
  }

  if (!input.designPermission.complete) {
    return "design_permission_classification_incomplete";
  }

  if (
    input.confirmedBy === "ai_project_manager" &&
    input.designPermission.authority !== "ai_project_manager"
  ) {
    return "design_requires_user_confirmation";
  }

  if (
    input.confirmedBy === "ai_project_manager" &&
    input.readiness.concerns.some((concern) => concern.touches_user_confirmation)
  ) {
    return "design_concern_requires_user_confirmation";
  }

  return null;
}

export function appendConfirmation(
  state: ChangeState,
  input: {
    gate: GateName;
    revision: number;
    artifacts: readonly ArtifactDigest[];
    confirmedBy: ConfirmationActor;
    confirmedAt: string;
    summary: string;
    evidence: string;
  },
): ChangeState {
  const next = structuredClone(state);
  const gate = next.gates[input.gate];

  gate.confirmations.push({
    revision: input.revision,
    artifacts: canonicalArtifacts(input.artifacts),
    confirmed_by: input.confirmedBy,
    confirmed_at: input.confirmedAt,
    summary: input.summary,
    evidence: input.evidence,
  });
  gate.status = "confirmed";

  switch (input.gate) {
    case "requirements":
      next.phase = "design";
      next.next_action = {
        owner: "ai_project_manager",
        action: "draft_design",
        inputs: ["design/README.md"],
      };
      break;
    case "design":
      next.phase = "implementation";
      next.next_action = {
        owner: "ai_project_manager",
        action: "start_implementation",
        inputs: ["delivery/README.md"],
      };
      break;
    case "acceptance":
      next.phase = "knowledge";
      next.next_action = {
        owner: "ai_project_manager",
        action: "draft_knowledge_update",
        inputs: ["knowledge-update.md"],
      };
      break;
    case "knowledge":
      next.phase = "knowledge";
      next.next_action = {
        owner: "ai_project_manager",
        action: "apply_knowledge",
        inputs: ["knowledge-update.md"],
      };
      break;
  }

  next.history.push({
    at: input.confirmedAt,
    event: input.gate + "_confirmed",
    summary:
      input.gate +
      " gate revision " +
      String(input.revision) +
      " confirmed by " +
      input.confirmedBy +
      ": " +
      input.summary,
  });

  return next;
}
