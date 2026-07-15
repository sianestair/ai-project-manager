import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { compileKnowledgeCandidates } from "../knowledge/candidates.js";
import {
  knowledgePatchDigest,
  renderKnowledgePatchDiff,
  stringifyKnowledgePatch,
  validateKnowledgePatchEnvelope,
} from "../knowledge/patch.js";
import { digestFile } from "../materials/digest.js";
import { findProjectRoot, locateActiveChange, readChangeState } from "../project/discover.js";
import { writeTextAtomic, writeYamlAtomic } from "../project/io.js";
import { resolveCanonicalState } from "../state/resolver.js";
import { validateChangeState } from "../state/schema.js";
import type { KnowledgePatchEnvelope } from "../state/types.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface KnowledgePreviewResult {
  changeId: string;
  candidateDigest: string;
  patchDigest: string | null;
  patchPath: string | null;
  targetCount: number;
  noChange: boolean;
  diff: string;
  nextAction: string;
}

export async function previewKnowledge(input: {
  project?: string;
  changeId: string;
}): Promise<KnowledgePreviewResult> {
  const projectRoot = await findProjectRoot(input.project);
  const located = await locateActiveChange(projectRoot, input.changeId);
  const resolved = await resolveCanonicalState({ project: projectRoot, changeId: input.changeId });
  if (!resolved.available_actions.some((action) => action.id === "preview_knowledge")) {
    const blocked = resolved.blocked_actions.find((action) => action.id === "preview_knowledge");
    throw new PmError(
      "knowledge_preview_blocked",
      "Knowledge preview is not available in the current state.",
      EXIT_CODES.blocked,
      blocked === undefined ? ["action_not_available"] : [blocked.reason, blocked.resume_when],
    );
  }

  const knowledgePath = join(located.changeDirectory, "knowledge-update.md");
  const knowledgeContent = await readFile(knowledgePath, "utf8");
  const candidateDigest = await digestFile(knowledgePath);
  const compiled = await compileKnowledgeCandidates({
    projectRoot,
    changeDirectory: located.changeDirectory,
    index: resolved.artifact_index,
    knowledgeContent,
  });
  let patch: KnowledgePatchEnvelope | null = null;
  let patchContent: string | null = null;
  let patchDigest: string | null = null;
  if (!compiled.noChange) {
    patch = await validateKnowledgePatchEnvelope({
      schema_version: 1,
      change_id: located.changeId,
      candidate_digest: candidateDigest,
      targets: compiled.targets,
    });
    patchContent = stringifyKnowledgePatch(patch);
    patchDigest = knowledgePatchDigest(patch);
  }

  const state = await readChangeState(located.changeDirectory);
  const nextState = structuredClone(state);
  nextState.materials.knowledge.included = patch === null ? [] : ["knowledge.patch"];
  nextState.knowledge_promotion = {
    status: "ready",
    candidate_digest: candidateDigest,
    patch_digest: patchDigest,
    targets: compiled.targets.map((target) => ({
      path: target.path,
      before_digest: target.before_digest,
      after_digest: target.after_digest,
    })),
    applied_files: [],
  };
  nextState.next_action = resolved.self_checks.knowledge.complete
    ? {
        owner: "ai_project_manager",
        action: "request_knowledge_confirmation",
        inputs:
          patch === null ? ["knowledge-update.md"] : ["knowledge-update.md", "knowledge.patch"],
      }
    : {
        owner: "ai_project_manager",
        action: "draft_knowledge_update",
        inputs: ["knowledge-update.md"],
      };
  await validateChangeState(nextState);

  const patchPath = join(located.changeDirectory, "knowledge.patch");
  const previousPatch = (await pathExists(patchPath)) ? await readFile(patchPath, "utf8") : null;
  try {
    if (patchContent === null) {
      await rm(patchPath, { force: true });
    } else {
      await writeTextAtomic(patchPath, patchContent);
    }
    await writeYamlAtomic(join(located.changeDirectory, "change.yaml"), nextState);
  } catch (error) {
    if (previousPatch === null) {
      await rm(patchPath, { force: true });
    } else {
      await writeTextAtomic(patchPath, previousPatch);
    }
    throw error;
  }

  return {
    changeId: located.changeId,
    candidateDigest,
    patchDigest,
    patchPath: patch === null ? null : "knowledge.patch",
    targetCount: compiled.targets.length,
    noChange: compiled.noChange,
    diff: patch === null ? "No knowledge changes." : renderKnowledgePatchDiff(patch),
    nextAction: nextState.next_action.action,
  };
}
