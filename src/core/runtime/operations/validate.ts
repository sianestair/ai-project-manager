import type { ResolvedChangeState } from "../state/types.js";

export function validationResult(state: ResolvedChangeState): {
  valid: boolean;
  error_count: number;
  warning_count: number;
} {
  const errorCount = state.diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = state.diagnostics.filter((item) => item.severity === "warning").length;

  return {
    valid: errorCount === 0,
    error_count: errorCount,
    warning_count: warningCount,
  };
}
