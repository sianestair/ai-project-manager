import type {
  ArchiveReadinessFacts,
  Blocker,
  ChangeState,
  GateName,
  KnowledgePromotionFacts,
  RecoveryFacts,
  ResolvedGate,
  ResolvedReadiness,
  ResolvedReview,
  TransactionFacts,
  VerificationFacts,
} from "../state/types.js";

export function resolveArchiveReadiness(input: {
  state: ChangeState;
  gates: Record<GateName, ResolvedGate>;
  readiness: ResolvedReadiness;
  verification: VerificationFacts;
  knowledge: KnowledgePromotionFacts;
  openBlockers: readonly Blocker[];
  review: ResolvedReview;
  recovery: RecoveryFacts;
  transaction: TransactionFacts;
}): ArchiveReadinessFacts {
  const unmet: string[] = [];
  if (input.state.phase !== "archive_ready") {
    unmet.push("phase_not_archive_ready");
  }
  if (input.state.status !== "active") {
    unmet.push("change_not_active");
  }
  for (const gate of ["requirements", "design", "acceptance", "knowledge"] as const) {
    if (!input.gates[gate].valid) {
      unmet.push(gate + "_gate_not_confirmed");
    }
  }
  if (!input.readiness.ready) {
    unmet.push("readiness_not_current");
  }
  if (
    input.state.implementation.status !== "verified" ||
    !input.verification.ready_for_acceptance
  ) {
    unmet.push("implementation_verification_not_current");
  }
  if (!input.knowledge.verified) {
    unmet.push("knowledge_promotion_not_verified");
  }
  if (input.openBlockers.length > 0) {
    unmet.push("open_blockers");
  }
  if (!input.review.can_continue || input.review.non_converging) {
    unmet.push("review_not_converged");
  }
  if (input.recovery.requires_reassessment || input.recovery.checkpoint.status !== "fresh") {
    unmet.push("implementation_checkpoint_not_current");
  }
  if (input.transaction.status !== "none") {
    unmet.push("transaction_recovery_required");
  }
  if (input.state.archive !== undefined) {
    unmet.push("archive_record_already_present");
  }

  return { ready: unmet.length === 0, unmet_conditions: [...new Set(unmet)] };
}
