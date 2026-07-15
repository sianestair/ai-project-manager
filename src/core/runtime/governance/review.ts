import { appendBlocker } from "./blockers.js";
import type {
  BlockerOwner,
  ChangeState,
  Diagnostic,
  ResolvedReview,
  ReviewOutcome,
} from "../state/types.js";

function error(code: string, path: string, message: string): Diagnostic {
  return { severity: "error", code, path, message };
}

export function resolveReview(
  state: ChangeState,
  openBlockers: readonly ChangeState["blockers"][number][],
): {
  review: ResolvedReview;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const atLimit = state.review.iteration >= state.review.max_iterations;
  const openNonConverging = openBlockers.some((blocker) => blocker.reason === "non_converging");
  const nonConverging = atLimit && state.review.last_outcome === "changes_requested";

  if (state.review.iteration > state.review.max_iterations) {
    diagnostics.push(
      error(
        "review_iteration_exceeded",
        "review.iteration",
        "Review iteration cannot exceed max_iterations.",
      ),
    );
  }

  const recordedIterations = state.history.filter(
    (event) => event.event === "review_changes_requested",
  ).length;
  if (recordedIterations < state.review.iteration) {
    diagnostics.push(
      error(
        "review_history_incomplete",
        "history",
        "Every review correction loop must append a review_changes_requested history event.",
      ),
    );
  }

  if (nonConverging && !openNonConverging) {
    diagnostics.push(
      error(
        "non_converging_blocker_required",
        "blockers",
        "A review loop at its limit with changes requested requires an open non_converging blocker.",
      ),
    );
  }

  if (openNonConverging && !nonConverging) {
    diagnostics.push(
      error(
        "non_converging_blocker_stale",
        "blockers",
        "An open non_converging blocker must correspond to the current review loop limit.",
      ),
    );
  }

  const implementation = state.implementation;
  if (
    implementation.status === "not_started" &&
    (implementation.baseline_revision !== null || implementation.final_revision !== null)
  ) {
    diagnostics.push(
      error(
        "implementation_revision_conflict",
        "implementation",
        "A not_started implementation cannot retain baseline or final revisions.",
      ),
    );
  }

  if (
    implementation.status === "in_progress" &&
    (implementation.baseline_revision === null || implementation.final_revision !== null)
  ) {
    diagnostics.push(
      error(
        "implementation_revision_conflict",
        "implementation",
        "An in_progress implementation requires a baseline revision and no final revision.",
      ),
    );
  }

  if (
    implementation.status === "verified" &&
    (implementation.baseline_revision === null || implementation.final_revision === null)
  ) {
    diagnostics.push(
      error(
        "implementation_revision_conflict",
        "implementation",
        "A verified implementation requires both baseline and final revisions.",
      ),
    );
  }

  const checkpoint = implementation.checkpoint;
  if ((checkpoint.scope_digest === null) !== (checkpoint.captured_at === null)) {
    diagnostics.push(
      error(
        "checkpoint_record_incomplete",
        "implementation.checkpoint",
        "Checkpoint scope_digest and captured_at must either both be present or both be null.",
      ),
    );
  }

  return {
    review: {
      ...state.review,
      at_limit: atLimit,
      non_converging: nonConverging,
      can_continue: !nonConverging && openBlockers.length === 0,
    },
    diagnostics,
  };
}

export function recordReviewOutcome(
  state: ChangeState,
  input: {
    outcome: ReviewOutcome;
    at: string;
    summary: string;
    blockedBy?: BlockerOwner;
    resumeWhen?: string;
  },
): ChangeState {
  if (
    input.outcome === "changes_requested" &&
    state.review.iteration >= state.review.max_iterations
  ) {
    throw new RangeError("Review iteration is already at max_iterations.");
  }

  let next = structuredClone(state);
  next.review.last_outcome = input.outcome;

  if (input.outcome === "passed") {
    next.history.push({
      at: input.at,
      event: "review_passed",
      summary: input.summary,
    });
    return next;
  }

  next.review.iteration += 1;
  next.history.push({
    at: input.at,
    event: "review_changes_requested",
    summary: input.summary,
  });

  if (next.review.iteration === next.review.max_iterations) {
    next = appendBlocker(
      next,
      {
        reason: "non_converging",
        blocked_by: input.blockedBy ?? "user",
        resume_when:
          input.resumeWhen ??
          "A responsible party decides whether to revise scope, roll back, or accept the deviation.",
        affected_stage: "implementation",
        created_at: input.at,
        status: "open",
      },
      "Review reached max_iterations without convergence: " + input.summary,
    );
  }

  return next;
}
