import type { Blocker, ChangeState, Diagnostic, NextAction } from "../state/types.js";

function error(code: string, path: string, message: string): Diagnostic {
  return { severity: "error", code, path, message };
}

export function blockerActionOwner(blockedBy: Blocker["blocked_by"]): NextAction["owner"] {
  if (blockedBy === "user") {
    return "user";
  }

  if (blockedBy === "ai_project_manager") {
    return "ai_project_manager";
  }

  return "external";
}

export function resolveBlockers(state: ChangeState): {
  blockers: Blocker[];
  openBlockers: Blocker[];
  diagnostics: Diagnostic[];
} {
  const blockers = state.blockers.map((blocker) => ({ ...blocker }));
  const openBlockers = blockers.filter((blocker) => blocker.status === "open");
  const diagnostics: Diagnostic[] = [];

  if (openBlockers.length > 0 && state.status !== "blocked") {
    diagnostics.push(
      error(
        "blocker_status_conflict",
        "status",
        "An unresolved blocker requires blocked Change status.",
      ),
    );
  }

  if (openBlockers.length === 0 && state.status === "blocked") {
    diagnostics.push(
      error(
        "blocker_status_conflict",
        "status",
        "Blocked status requires at least one unresolved blocker.",
      ),
    );
  }

  if (openBlockers.filter((blocker) => blocker.reason === "non_converging").length > 1) {
    diagnostics.push(
      error(
        "duplicate_non_converging_blocker",
        "blockers",
        "Only one unresolved non_converging blocker may represent the current review loop.",
      ),
    );
  }

  return { blockers, openBlockers, diagnostics };
}

export function appendBlocker(state: ChangeState, blocker: Blocker, summary: string): ChangeState {
  const next = structuredClone(state);
  next.blockers.push({ ...blocker });
  next.status = "blocked";
  next.next_action = {
    owner: blockerActionOwner(blocker.blocked_by),
    action: "resolve_blocker",
    inputs: ["change.yaml"],
  };
  next.history.push({
    at: blocker.created_at,
    event: "blocker_recorded",
    summary,
  });
  return next;
}
