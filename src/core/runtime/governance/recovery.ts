import { digestText } from "../materials/digest.js";
import { normalizeRelativePath } from "../materials/paths.js";
import { digestProjectScope, getGitWorkspaceSnapshot } from "../project/git.js";
import type {
  ChangeState,
  DependencyDriftFact,
  Diagnostic,
  GateName,
  RecoveryFacts,
} from "../state/types.js";

function diagnostic(
  severity: Diagnostic["severity"],
  code: string,
  path: string,
  message: string,
): Diagnostic {
  return { severity, code, path, message };
}

function pathBelongsToScope(path: string, scope: string): boolean {
  return path === scope || path.startsWith(scope.endsWith("/") ? scope : scope + "/");
}

function scopeDigest(facts: readonly DependencyDriftFact[]): string | null {
  if (facts.length === 0) {
    return null;
  }

  const content = [...facts]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((fact) => fact.path + "\0" + (fact.current_digest ?? "absent"))
    .join("\n");
  return digestText(content);
}

export async function resolveRecoveryFacts(input: {
  projectRoot: string;
  state: ChangeState;
  confirmedGates: readonly GateName[];
}): Promise<{
  recovery: RecoveryFacts;
  diagnostics: Diagnostic[];
}> {
  const diagnostics: Diagnostic[] = [];
  const facts: DependencyDriftFact[] = [];

  for (const kind of ["knowledge", "engineering"] as const) {
    const expectedRoot = kind === "knowledge" ? "knowledge-base" : "engineering";
    const seen = new Set<string>();
    for (const [index, dependency] of input.state.base.dependencies[kind].entries()) {
      const statePath = "base.dependencies." + kind + "[" + String(index) + "]";
      let canonicalPath: string;
      try {
        canonicalPath = normalizeRelativePath(dependency.path);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid dependency path.";
        diagnostics.push(
          diagnostic("error", "dependency_path_invalid", statePath + ".path", message),
        );
        facts.push({
          kind,
          path: dependency.path,
          purpose: dependency.purpose,
          expected_digest: dependency.digest,
          current_digest: null,
          status: "invalid",
        });
        continue;
      }

      if (canonicalPath !== dependency.path) {
        diagnostics.push(
          diagnostic(
            "error",
            "dependency_path_not_canonical",
            statePath + ".path",
            "Dependency paths must use canonical POSIX form.",
          ),
        );
      }

      if (!pathBelongsToScope(canonicalPath, expectedRoot)) {
        diagnostics.push(
          diagnostic(
            "error",
            "dependency_path_outside_contract",
            statePath + ".path",
            kind + " dependencies must remain under " + expectedRoot + "/.",
          ),
        );
      }

      if (seen.has(canonicalPath)) {
        diagnostics.push(
          diagnostic(
            "error",
            "dependency_path_duplicate",
            statePath + ".path",
            "A dependency scope may be registered only once per dependency kind.",
          ),
        );
      }
      seen.add(canonicalPath);

      try {
        const currentDigest = await digestProjectScope(input.projectRoot, canonicalPath);
        const status = currentDigest === dependency.digest ? "current" : "changed";
        facts.push({
          kind,
          path: dependency.path,
          purpose: dependency.purpose,
          expected_digest: dependency.digest,
          current_digest: currentDigest,
          status,
        });
        if (status === "changed") {
          diagnostics.push(
            diagnostic(
              "warning",
              "dependency_drift",
              statePath,
              "Registered " + kind + " dependency changed: " + canonicalPath + ".",
            ),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Dependency is unavailable.";
        const missing = /ENOENT|cannot find|no such file/i.test(message);
        facts.push({
          kind,
          path: dependency.path,
          purpose: dependency.purpose,
          expected_digest: dependency.digest,
          current_digest: null,
          status: missing ? "missing" : "invalid",
        });
        diagnostics.push(
          diagnostic(
            missing ? "warning" : "error",
            missing ? "dependency_missing" : "dependency_unreadable",
            statePath,
            message,
          ),
        );
      }
    }
  }

  const engineeringFacts = facts.filter((fact) => fact.kind === "engineering");
  const currentScopeDigest = scopeDigest(engineeringFacts);
  const checkpoint = input.state.implementation.checkpoint;
  let checkpointStatus: RecoveryFacts["checkpoint"]["status"] = "not_recorded";
  if (checkpoint.scope_digest !== null) {
    if (
      currentScopeDigest === null ||
      engineeringFacts.some((fact) => fact.current_digest === null)
    ) {
      checkpointStatus = "unavailable";
    } else if (checkpoint.scope_digest === currentScopeDigest) {
      checkpointStatus = "fresh";
    } else {
      checkpointStatus = "stale";
    }
  }

  if (checkpointStatus === "stale" || checkpointStatus === "unavailable") {
    diagnostics.push(
      diagnostic(
        "warning",
        "checkpoint_drift",
        "implementation.checkpoint",
        "The implementation checkpoint no longer matches the registered engineering scope.",
      ),
    );
  }

  const workspace = getGitWorkspaceSnapshot(input.projectRoot);
  const registeredScopes = facts
    .filter((fact) => fact.status !== "invalid")
    .map((fact) => fact.path);
  const workspaceChanges = workspace.changes.map((change) => ({
    ...change,
    registered: registeredScopes.some((scope) => pathBelongsToScope(change.path, scope)),
  }));
  const unregisteredCount = workspaceChanges.filter((change) => !change.registered).length;
  if (unregisteredCount > 0) {
    diagnostics.push(
      diagnostic(
        "information",
        "unregistered_workspace_changes",
        "workspace",
        String(unregisteredCount) +
          " workspace change(s) are outside registered dependency scopes.",
      ),
    );
  }

  if (
    workspace.revision !== null &&
    input.state.base.project_revision !== null &&
    workspace.revision !== input.state.base.project_revision
  ) {
    diagnostics.push(
      diagnostic(
        "information",
        "project_revision_changed",
        "base.project_revision",
        "Git HEAD differs from the revision captured when the Change started.",
      ),
    );
  }

  const dependencyRequiresReassessment = facts.some((fact) => fact.status !== "current");
  const checkpointRequiresReassessment =
    checkpointStatus === "stale" || checkpointStatus === "unavailable";
  const requiresReassessment = dependencyRequiresReassessment || checkpointRequiresReassessment;
  const resumeConditions = facts
    .filter((fact) => fact.status !== "current")
    .map((fact) => "Reassess registered " + fact.kind + " dependency " + fact.path + ".");
  if (checkpointRequiresReassessment) {
    resumeConditions.push("Reassess and recapture the implementation checkpoint.");
  }

  return {
    recovery: {
      current_goal: input.state.title,
      inputs: [],
      confirmed_gates: [...input.confirmedGates],
      requires_reassessment: requiresReassessment,
      dependency_drift: facts,
      checkpoint: {
        recorded_scope_digest: checkpoint.scope_digest,
        current_scope_digest: currentScopeDigest,
        recorded_at: checkpoint.captured_at,
        status: checkpointStatus,
      },
      workspace: {
        git_available: workspace.available,
        base_revision: input.state.base.project_revision,
        current_revision: workspace.revision,
        changes: workspaceChanges,
      },
      resume_conditions: resumeConditions,
    },
    diagnostics,
  };
}
