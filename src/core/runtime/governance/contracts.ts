import type { ChangeState, Diagnostic } from "../state/types.js";
import type { ContractResolution, TraceabilityResolution } from "./traceability.js";
import type { TaskContractFacts, VerificationFacts } from "../state/types.js";

const PHASE_ORDER: Record<ChangeState["phase"], number> = {
  requirements: 0,
  design: 1,
  implementation: 2,
  acceptance: 3,
  knowledge: 4,
  archive_ready: 5,
  archived: 6,
};

export function requiredContractDiagnostics(input: {
  state: ChangeState;
  traceability: TraceabilityResolution;
  tasks: ContractResolution<TaskContractFacts>;
  verification: ContractResolution<VerificationFacts>;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const phase = PHASE_ORDER[input.state.phase];

  if (input.state.gates.requirements.status === "confirmed" || phase > PHASE_ORDER.requirements) {
    diagnostics.push(...input.traceability.requirementsGateDiagnostics);
  }
  if (input.state.gates.design.status === "confirmed" || phase > PHASE_ORDER.design) {
    diagnostics.push(...input.traceability.designGateDiagnostics, ...input.tasks.gateDiagnostics);
  }
  if (input.state.implementation.status === "verified" || phase >= PHASE_ORDER.acceptance) {
    diagnostics.push(...input.verification.gateDiagnostics);
  }

  return diagnostics;
}
