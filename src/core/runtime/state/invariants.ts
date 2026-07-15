import type { ChangeState, Diagnostic, MaterialSetName } from "./types.js";

function error(code: string, path: string, message: string): Diagnostic {
  return {
    severity: "error",
    code,
    path,
    message,
  };
}

const EXPECTED_GATE_SETS: ReadonlyArray<[keyof ChangeState["gates"], MaterialSetName]> = [
  ["requirements", "requirements"],
  ["design", "design"],
  ["acceptance", "delivery"],
  ["knowledge", "knowledge"],
];

const EXPECTED_REQUIRED: Record<MaterialSetName, string[]> = {
  requirements: ["requirements.md"],
  design: ["design/README.md"],
  delivery: ["delivery/README.md"],
  knowledge: ["knowledge-update.md"],
};

export function validateStateInvariants(state: ChangeState, locatedChangeId: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (state.change_id !== locatedChangeId) {
    diagnostics.push(
      error(
        "change_id_directory_mismatch",
        "change_id",
        "change.yaml change_id must match its active directory name.",
      ),
    );
  }

  for (const [gateName, expectedSet] of EXPECTED_GATE_SETS) {
    const gate = state.gates[gateName];
    if (gate.material_set !== expectedSet) {
      diagnostics.push(
        error(
          "gate_material_set_mismatch",
          "gates." + gateName + ".material_set",
          "Gate " + gateName + " must bind the " + expectedSet + " material set.",
        ),
      );
    }

    if (gate.status === "confirmed" && gate.confirmations.length === 0) {
      diagnostics.push(
        error(
          "confirmed_gate_without_record",
          "gates." + gateName,
          "A confirmed gate must contain at least one confirmation record.",
        ),
      );
    }
  }

  for (const materialName of Object.keys(EXPECTED_REQUIRED) as MaterialSetName[]) {
    const actual = state.materials[materialName].required;
    if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_REQUIRED[materialName])) {
      diagnostics.push(
        error(
          "required_material_contract_changed",
          "materials." + materialName + ".required",
          "The fixed first-version required material entry cannot be changed.",
        ),
      );
    }
  }

  if (state.phase === "requirements" && state.gates.requirements.status === "confirmed") {
    diagnostics.push(
      error(
        "phase_gate_conflict",
        "phase",
        "A Change with a confirmed requirements gate must advance beyond requirements.",
      ),
    );
  }

  if (state.phase === "design" && state.gates.requirements.status !== "confirmed") {
    diagnostics.push(
      error(
        "phase_gate_conflict",
        "phase",
        "The design phase requires a confirmed requirements gate.",
      ),
    );
  }

  if (state.phase === "implementation" && state.gates.design.status !== "confirmed") {
    diagnostics.push(
      error(
        "phase_gate_conflict",
        "phase",
        "The implementation phase requires a confirmed design gate.",
      ),
    );
  }

  if (state.phase === "archived" && state.status !== "completed") {
    diagnostics.push(
      error(
        "archive_status_conflict",
        "status",
        "Only a completed Change may have phase archived.",
      ),
    );
  }

  if (state.status === "completed" && state.phase !== "archived") {
    diagnostics.push(
      error(
        "completed_phase_conflict",
        "phase",
        "Only the archived phase may use completed status.",
      ),
    );
  }

  if (state.phase === "archived" && state.archive === undefined) {
    diagnostics.push(
      error(
        "archive_record_missing",
        "archive",
        "An archived Change must retain its terminal archive record.",
      ),
    );
  }
  if (state.phase !== "archived" && state.archive !== undefined) {
    diagnostics.push(
      error(
        "archive_record_phase_conflict",
        "archive",
        "Only an archived Change may retain a terminal archive record.",
      ),
    );
  }
  if (
    state.archive !== undefined &&
    (state.archive.final_revision !== state.implementation.final_revision ||
      JSON.stringify(state.archive.applied_files) !==
        JSON.stringify(state.knowledge_promotion.applied_files))
  ) {
    diagnostics.push(
      error(
        "archive_record_mismatch",
        "archive",
        "Archive final revision and applied files must match the terminal implementation state.",
      ),
    );
  }
  if (state.phase === "archived") {
    for (const [gateName] of EXPECTED_GATE_SETS) {
      const gate = state.gates[gateName];
      const latestRevision = gate.confirmations.at(-1)?.revision;
      if (gate.status !== "confirmed") {
        diagnostics.push(
          error(
            "archive_gate_not_confirmed",
            "gates." + gateName,
            "Every archived gate must retain a confirmed terminal record.",
          ),
        );
      }
      if (
        state.archive !== undefined &&
        state.archive.confirmation_revisions[gateName] !== latestRevision
      ) {
        diagnostics.push(
          error(
            "archive_confirmation_revision_mismatch",
            "archive.confirmation_revisions." + gateName,
            "Archived confirmation revisions must reference the latest gate records.",
          ),
        );
      }
    }
    if (
      state.implementation.status !== "verified" ||
      state.knowledge_promotion.status !== "verified"
    ) {
      diagnostics.push(
        error(
          "archive_verification_missing",
          "archive",
          "An archived Change must retain verified implementation and knowledge promotion state.",
        ),
      );
    }
    if (state.next_action.action !== "inspect_archive") {
      diagnostics.push(
        error(
          "archive_next_action_conflict",
          "next_action.action",
          "An archived Change only exposes inspect_archive as its next action.",
        ),
      );
    }
  }

  return diagnostics;
}
