import { access } from "node:fs/promises";
import { join } from "node:path";

import { readKnowledgePatch, knowledgePatchDigest } from "../knowledge/patch.js";
import { resolveKnowledgeTarget } from "../knowledge/paths.js";
import { digestFile } from "../materials/digest.js";
import type {
  ChangeState,
  Diagnostic,
  KnowledgePromotionFacts,
  KnowledgePatchEnvelope,
} from "../state/types.js";

function diagnostic(
  severity: Diagnostic["severity"],
  code: string,
  path: string,
  message: string,
): Diagnostic {
  return { severity, code, path, message };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function patchTargetsMatchState(patch: KnowledgePatchEnvelope, state: ChangeState): boolean {
  return (
    JSON.stringify(
      patch.targets.map((target) => ({
        path: target.path,
        before_digest: target.before_digest,
        after_digest: target.after_digest,
      })),
    ) === JSON.stringify(state.knowledge_promotion.targets)
  );
}

export async function resolveKnowledgePromotion(input: {
  projectRoot: string;
  changeDirectory: string;
  state: ChangeState;
  archived: boolean;
}): Promise<{ facts: KnowledgePromotionFacts; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const promotion = input.state.knowledge_promotion;
  const conflicts: string[] = [];
  const candidatePath = join(input.changeDirectory, "knowledge-update.md");
  const currentCandidateDigest = await digestFile(candidatePath);
  const candidateCurrent =
    promotion.candidate_digest !== null && promotion.candidate_digest === currentCandidateDigest;
  const noChange = promotion.patch_digest === null && promotion.targets.length === 0;
  let patch: KnowledgePatchEnvelope | null = null;
  let patchCurrent = noChange && promotion.status !== "not_started";

  if (promotion.patch_digest !== null) {
    const patchPath = join(input.changeDirectory, "knowledge.patch");
    try {
      patch = await readKnowledgePatch(patchPath);
      patchCurrent =
        knowledgePatchDigest(patch) === promotion.patch_digest &&
        patch.change_id === input.state.change_id &&
        patch.candidate_digest === promotion.candidate_digest &&
        patchTargetsMatchState(patch, input.state);
      if (!patchCurrent) {
        conflicts.push("knowledge.patch");
      }
    } catch (error) {
      patchCurrent = false;
      conflicts.push("knowledge.patch");
      const message = error instanceof Error ? error.message : "Knowledge patch is unreadable.";
      diagnostics.push(
        diagnostic(
          promotion.status === "verified" || promotion.status === "applied" ? "error" : "warning",
          "knowledge_patch_invalid",
          "knowledge.patch",
          message,
        ),
      );
    }
  } else if (await exists(join(input.changeDirectory, "knowledge.patch"))) {
    patchCurrent = false;
    conflicts.push("unexpected knowledge.patch");
  }

  if (promotion.status === "not_started") {
    if (
      promotion.candidate_digest !== null ||
      promotion.patch_digest !== null ||
      promotion.targets.length > 0 ||
      promotion.applied_files.length > 0
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "knowledge_promotion_state_conflict",
          "knowledge_promotion",
          "not_started knowledge promotion cannot retain preview or application data.",
        ),
      );
    }
    return {
      facts: {
        status: promotion.status,
        candidate_current: false,
        patch_current: false,
        targets_current: false,
        no_change: false,
        ready_for_confirmation: false,
        ready_to_apply: false,
        verified: false,
        conflicts,
      },
      diagnostics,
    };
  }

  if (!candidateCurrent) {
    conflicts.push("knowledge-update.md");
  }
  let targetsCurrent = true;
  const expectedApplied = [];
  const expectedDigestField =
    promotion.status === "verified" || promotion.status === "applied"
      ? "after_digest"
      : "before_digest";
  for (const target of promotion.targets) {
    const expected = target[expectedDigestField];
    if (input.archived && promotion.status === "verified") {
      if (expected !== "absent") {
        expectedApplied.push({ path: target.path, digest: expected });
      }
      continue;
    }
    try {
      const resolved = await resolveKnowledgeTarget({
        projectRoot: input.projectRoot,
        path: target.path,
      });
      const current = resolved.exists ? await digestFile(resolved.fullPath) : "absent";
      if (current !== expected) {
        targetsCurrent = false;
        conflicts.push(target.path);
      }
      if (target.after_digest !== "absent") {
        expectedApplied.push({ path: target.path, digest: target.after_digest });
      }
    } catch {
      targetsCurrent = false;
      conflicts.push(target.path);
    }
  }

  const appliedFilesCurrent =
    JSON.stringify(
      [...promotion.applied_files].sort((left, right) => left.path.localeCompare(right.path)),
    ) ===
    JSON.stringify(expectedApplied.sort((left, right) => left.path.localeCompare(right.path)));
  if ((promotion.status === "verified" || promotion.status === "applied") && !appliedFilesCurrent) {
    targetsCurrent = false;
    conflicts.push("knowledge_promotion.applied_files");
  }

  const ready = candidateCurrent && patchCurrent && targetsCurrent;
  if (!ready) {
    diagnostics.push(
      diagnostic(
        promotion.status === "verified" || promotion.status === "applied" ? "error" : "warning",
        promotion.status === "verified" || promotion.status === "applied"
          ? "knowledge_application_mismatch"
          : "knowledge_preview_stale",
        "knowledge_promotion",
        "Knowledge candidate, patch, or target digests no longer match the recorded promotion.",
      ),
    );
  }

  return {
    facts: {
      status: promotion.status,
      candidate_current: candidateCurrent,
      patch_current: patchCurrent,
      targets_current: targetsCurrent,
      no_change: noChange,
      ready_for_confirmation: promotion.status === "ready" && ready,
      ready_to_apply: promotion.status === "ready" && ready,
      verified: promotion.status === "verified" && ready,
      conflicts: [...new Set(conflicts)].sort(),
    },
    diagnostics,
  };
}
