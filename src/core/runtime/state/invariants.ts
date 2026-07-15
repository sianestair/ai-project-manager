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

  return diagnostics;
}
