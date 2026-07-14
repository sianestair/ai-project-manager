import type { ResolvedChangeState } from "../state/types.js";
import { validationResult } from "../operations/validate.js";

export function renderStatus(state: ResolvedChangeState): string {
  const lines = [
    "Project: " + state.project.project_id,
    "Root: " + state.project.root,
    "Change: " + state.change.change_id + " — " + state.change.title,
    "Phase: " + state.change.phase,
    "Status: " + state.change.status,
    "Current goal: " + state.recovery.current_goal,
    "",
    "Available actions:",
  ];

  if (state.available_actions.length === 0) {
    lines.push("- none");
  } else {
    for (const action of state.available_actions) {
      lines.push("- " + action.id + " [" + action.owner + "]: " + action.description);
    }
  }

  lines.push("", "Blocked actions:");
  for (const action of state.blocked_actions) {
    lines.push("- " + action.id + ": " + action.reason + " (resume: " + action.resume_when + ")");
  }

  lines.push(
    "",
    "Next action: " +
      state.next_action.action +
      " [" +
      state.next_action.owner +
      "]" +
      (state.next_action.valid ? "" : " (INVALID)"),
  );

  if (state.diagnostics.length > 0) {
    lines.push("", "Diagnostics:");
    for (const item of state.diagnostics) {
      lines.push(
        "- " +
          item.severity.toUpperCase() +
          " " +
          item.code +
          " at " +
          item.path +
          ": " +
          item.message,
      );
    }
  }

  return lines.join("\n");
}

export function renderValidation(state: ResolvedChangeState): string {
  const result = validationResult(state);
  const lines = [
    result.valid ? "VALID" : "INVALID",
    "Change: " + state.change.change_id,
    "Errors: " + String(result.error_count),
    "Warnings: " + String(result.warning_count),
  ];

  for (const item of state.diagnostics) {
    lines.push(
      "- " +
        item.severity.toUpperCase() +
        " " +
        item.code +
        " at " +
        item.path +
        ": " +
        item.message,
    );
  }

  return lines.join("\n");
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
