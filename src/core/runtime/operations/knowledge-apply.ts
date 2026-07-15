import { mkdir, rm, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { knowledgePatchDigest, readKnowledgePatch } from "../knowledge/patch.js";
import { resolveKnowledgeTarget } from "../knowledge/paths.js";
import { digestFile } from "../materials/digest.js";
import { findProjectRoot, locateActiveChange, readChangeState } from "../project/discover.js";
import { writeTextAtomic, writeYamlAtomic } from "../project/io.js";
import { resolveCanonicalState } from "../state/resolver.js";
import { validateChangeState } from "../state/schema.js";
import type { ArtifactDigest, ChangeState, KnowledgePatchEnvelope } from "../state/types.js";
import {
  createKnowledgeTransaction,
  readStagedImage,
  readTransactionJournal,
  removeTransaction,
  SimulatedInterruption,
  writeTransactionJournal,
  type KnowledgeTransactionJournal,
} from "./transaction.js";

export interface KnowledgeApplyHooks {
  afterTargetWrite?(index: number): Promise<void> | void;
  beforeStateWrite?(): Promise<void> | void;
  afterStateWrite?(): Promise<void> | void;
}

function currentDigest(exists: boolean, fullPath: string): Promise<string> | string {
  return exists ? digestFile(fullPath) : "absent";
}

async function applyImage(input: {
  projectRoot: string;
  path: string;
  image: string | null;
}): Promise<void> {
  const target = await resolveKnowledgeTarget({ projectRoot: input.projectRoot, path: input.path });
  if (input.image === null) {
    await rm(target.fullPath, { force: true });
    return;
  }
  await mkdir(dirname(target.fullPath), { recursive: true });
  await writeTextAtomic(target.fullPath, input.image);
}

async function cleanupCreatedParents(projectRoot: string, path: string): Promise<void> {
  const fullPath = (await resolveKnowledgeTarget({ projectRoot, path })).fullPath;
  const parts = path.split("/");
  const stop = join(projectRoot, ...parts.slice(0, 2));
  let current = dirname(fullPath);
  while (current !== stop) {
    try {
      await rmdir(current);
    } catch {
      return;
    }
    current = dirname(current);
  }
}

async function precheckTargets(projectRoot: string, patch: KnowledgePatchEnvelope): Promise<void> {
  const conflicts: string[] = [];
  for (const target of patch.targets) {
    const current = await resolveKnowledgeTarget({ projectRoot, path: target.path });
    if ((await currentDigest(current.exists, current.fullPath)) !== target.before_digest) {
      conflicts.push(target.path);
    }
  }
  if (conflicts.length > 0) {
    throw new PmError(
      "knowledge_before_digest_conflict",
      "Knowledge targets changed after preview; zero targets were modified.",
      EXIT_CODES.conflict,
      conflicts,
    );
  }
}

async function assertTransactionTargetsRecoverable(
  projectRoot: string,
  journal: KnowledgeTransactionJournal,
): Promise<void> {
  for (const target of journal.targets) {
    const current = await resolveKnowledgeTarget({ projectRoot, path: target.path });
    const digest = await currentDigest(current.exists, current.fullPath);
    if (digest !== target.before_digest && digest !== target.after_digest) {
      throw new PmError(
        "transaction_target_conflict",
        "Knowledge target has a third-party value that cannot be recovered mechanically.",
        EXIT_CODES.conflict,
        [target.path],
      );
    }
  }
}

async function rollbackTransaction(input: {
  projectRoot: string;
  changeDirectory: string;
  journal: KnowledgeTransactionJournal;
}): Promise<void> {
  for (const target of [...input.journal.targets].reverse()) {
    const before = await readStagedImage(input.changeDirectory, target.before_stage);
    await applyImage({ projectRoot: input.projectRoot, path: target.path, image: before });
    if (target.before_digest === "absent") {
      await cleanupCreatedParents(input.projectRoot, target.path);
    }
  }
  for (const target of input.journal.targets) {
    const current = await resolveKnowledgeTarget({
      projectRoot: input.projectRoot,
      path: target.path,
    });
    if ((await currentDigest(current.exists, current.fullPath)) !== target.before_digest) {
      throw new PmError(
        "transaction_rollback_failed",
        "Knowledge transaction could not restore every before-image.",
        EXIT_CODES.internal,
        [target.path],
      );
    }
  }
}

function verifiedState(
  state: ChangeState,
  appliedFiles: ArtifactDigest[],
  targets: KnowledgePatchEnvelope["targets"],
  at: string,
): ChangeState {
  const next = structuredClone(state);
  const targetsByPath = new Map(targets.map((target) => [target.path, target]));
  next.base.dependencies.knowledge = next.base.dependencies.knowledge.flatMap((dependency) => {
    const target = targetsByPath.get(dependency.path);
    if (target === undefined) {
      return [dependency];
    }
    if (target.after_digest === "absent") {
      return [];
    }
    return [{ ...dependency, digest: target.after_digest }];
  });
  next.knowledge_promotion.status = "verified";
  next.knowledge_promotion.applied_files = appliedFiles;
  next.phase = "archive_ready";
  next.next_action = {
    owner: "ai_project_manager",
    action: "check_archive",
    inputs: ["change.yaml"],
  };
  next.history.push({
    at,
    event: "knowledge_applied",
    summary:
      appliedFiles.length === 0
        ? "Verified the confirmed no-knowledge-change conclusion."
        : "Atomically applied and verified " + String(appliedFiles.length) + " knowledge file(s).",
  });
  return next;
}

async function appliedArtifacts(
  projectRoot: string,
  patch: KnowledgePatchEnvelope,
): Promise<ArtifactDigest[]> {
  const artifacts: ArtifactDigest[] = [];
  for (const target of patch.targets) {
    const current = await resolveKnowledgeTarget({ projectRoot, path: target.path });
    const digest = await currentDigest(current.exists, current.fullPath);
    if (digest !== target.after_digest) {
      throw new PmError(
        "knowledge_after_digest_mismatch",
        "Knowledge target does not match the confirmed post-image.",
        EXIT_CODES.internal,
        [target.path],
      );
    }
    if (digest !== "absent") {
      artifacts.push({ path: target.path, digest });
    }
  }
  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

async function commitTransaction(input: {
  projectRoot: string;
  changeDirectory: string;
  journal: KnowledgeTransactionJournal;
  hooks: KnowledgeApplyHooks;
}): Promise<void> {
  for (const [index, target] of input.journal.targets.entries()) {
    const after = await readStagedImage(input.changeDirectory, target.after_stage);
    await applyImage({ projectRoot: input.projectRoot, path: target.path, image: after });
    const current = await resolveKnowledgeTarget({
      projectRoot: input.projectRoot,
      path: target.path,
    });
    if ((await currentDigest(current.exists, current.fullPath)) !== target.after_digest) {
      throw new PmError(
        "knowledge_after_digest_mismatch",
        "Knowledge target does not match its staged post-image.",
        EXIT_CODES.internal,
        [target.path],
      );
    }
    input.journal.completed_targets = index + 1;
    await writeTransactionJournal(input.changeDirectory, input.journal);
    await input.hooks.afterTargetWrite?.(index);
  }
}

export interface KnowledgeApplyResult {
  changeId: string;
  appliedFiles: ArtifactDigest[];
  noChange: boolean;
  phase: string;
  nextAction: string;
}

export async function applyKnowledge(
  input: { project?: string; changeId: string },
  hooks: KnowledgeApplyHooks = {},
  now: () => string = () => new Date().toISOString(),
): Promise<KnowledgeApplyResult> {
  const projectRoot = await findProjectRoot(input.project);
  const located = await locateActiveChange(projectRoot, input.changeId);
  const resolved = await resolveCanonicalState({ project: projectRoot, changeId: input.changeId });
  if (!resolved.available_actions.some((action) => action.id === "apply_knowledge")) {
    if (
      resolved.gates.knowledge.valid &&
      resolved.knowledge_promotion.status === "ready" &&
      !resolved.knowledge_promotion.targets_current
    ) {
      throw new PmError(
        "knowledge_before_digest_conflict",
        "Knowledge targets changed after confirmation; zero targets were modified.",
        EXIT_CODES.conflict,
        resolved.knowledge_promotion.conflicts,
      );
    }
    const blocked = resolved.blocked_actions.find((action) => action.id === "apply_knowledge");
    throw new PmError(
      "knowledge_apply_blocked",
      "Knowledge apply is not available in the current state.",
      EXIT_CODES.blocked,
      blocked === undefined ? ["action_not_available"] : [blocked.reason, blocked.resume_when],
    );
  }
  const state = await readChangeState(located.changeDirectory);
  if (state.knowledge_promotion.patch_digest === null) {
    const next = verifiedState(state, [], [], now());
    await validateChangeState(next);
    await writeYamlAtomic(join(located.changeDirectory, "change.yaml"), next);
    return {
      changeId: located.changeId,
      appliedFiles: [],
      noChange: true,
      phase: next.phase,
      nextAction: next.next_action.action,
    };
  }

  const patch = await readKnowledgePatch(join(located.changeDirectory, "knowledge.patch"));
  const patchDigest = knowledgePatchDigest(patch);
  if (
    patchDigest !== state.knowledge_promotion.patch_digest ||
    patch.candidate_digest !== state.knowledge_promotion.candidate_digest
  ) {
    throw new PmError(
      "knowledge_patch_confirmation_mismatch",
      "The knowledge patch no longer matches the confirmed promotion state.",
      EXIT_CODES.conflict,
    );
  }
  await precheckTargets(projectRoot, patch);
  const journal = await createKnowledgeTransaction({
    changeDirectory: located.changeDirectory,
    patch,
    patchDigest,
  });
  let stateWritten = false;
  try {
    await commitTransaction({
      projectRoot,
      changeDirectory: located.changeDirectory,
      journal,
      hooks,
    });
    const appliedFiles = await appliedArtifacts(projectRoot, patch);
    const next = verifiedState(state, appliedFiles, patch.targets, now());
    await validateChangeState(next);
    await hooks.beforeStateWrite?.();
    await writeYamlAtomic(join(located.changeDirectory, "change.yaml"), next);
    stateWritten = true;
    await hooks.afterStateWrite?.();
    await removeTransaction(located.changeDirectory);
    return {
      changeId: located.changeId,
      appliedFiles,
      noChange: false,
      phase: next.phase,
      nextAction: next.next_action.action,
    };
  } catch (error) {
    if (error instanceof SimulatedInterruption) {
      throw error;
    }
    if (stateWritten) {
      const message = error instanceof Error ? error.message : "Unknown cleanup error.";
      throw new PmError(
        "transaction_recovery_required",
        "Knowledge files and state were committed, but transaction cleanup requires recovery.",
        EXIT_CODES.internal,
        [message],
      );
    }
    await assertTransactionTargetsRecoverable(projectRoot, journal);
    await rollbackTransaction({ projectRoot, changeDirectory: located.changeDirectory, journal });
    await removeTransaction(located.changeDirectory);
    throw error;
  }
}

export async function recoverKnowledgeTransaction(input: {
  project?: string;
  changeId: string;
  strategy: "commit" | "rollback";
}): Promise<KnowledgeApplyResult> {
  const projectRoot = await findProjectRoot(input.project);
  const located = await locateActiveChange(projectRoot, input.changeId);
  const journal = await readTransactionJournal(located.changeDirectory);
  const state = await readChangeState(located.changeDirectory);
  const patch = await readKnowledgePatch(join(located.changeDirectory, "knowledge.patch"));
  if (
    journal.change_id !== state.change_id ||
    journal.patch_digest !== knowledgePatchDigest(patch) ||
    journal.candidate_digest !== patch.candidate_digest
  ) {
    throw new PmError(
      "transaction_payload_mismatch",
      "Transaction recovery payload no longer matches knowledge.patch.",
      EXIT_CODES.conflict,
    );
  }

  await assertTransactionTargetsRecoverable(projectRoot, journal);

  if (input.strategy === "rollback") {
    await rollbackTransaction({ projectRoot, changeDirectory: located.changeDirectory, journal });
    const rollbackState = await readChangeState(located.changeDirectory);
    rollbackState.knowledge_promotion.status = "ready";
    rollbackState.knowledge_promotion.applied_files = [];
    rollbackState.phase = "knowledge";
    rollbackState.next_action = {
      owner: "ai_project_manager",
      action: "apply_knowledge",
      inputs: ["knowledge-update.md"],
    };
    rollbackState.history.push({
      at: new Date().toISOString(),
      event: "knowledge_transaction_rolled_back",
      summary: "Restored every confirmed knowledge before-image and returned to apply-ready state.",
    });
    await validateChangeState(rollbackState);
    await writeYamlAtomic(join(located.changeDirectory, "change.yaml"), rollbackState);
    await removeTransaction(located.changeDirectory);
    return {
      changeId: located.changeId,
      appliedFiles: [],
      noChange: false,
      phase: rollbackState.phase,
      nextAction: rollbackState.next_action.action,
    };
  }

  if (state.knowledge_promotion.status === "verified") {
    const alreadyApplied = await appliedArtifacts(projectRoot, patch);
    await removeTransaction(located.changeDirectory);
    return {
      changeId: located.changeId,
      appliedFiles: alreadyApplied,
      noChange: false,
      phase: state.phase,
      nextAction: state.next_action.action,
    };
  }

  await commitTransaction({
    projectRoot,
    changeDirectory: located.changeDirectory,
    journal,
    hooks: {},
  });
  const appliedFiles = await appliedArtifacts(projectRoot, patch);
  const next = verifiedState(state, appliedFiles, patch.targets, new Date().toISOString());
  await validateChangeState(next);
  await writeYamlAtomic(join(located.changeDirectory, "change.yaml"), next);
  await removeTransaction(located.changeDirectory);
  return {
    changeId: located.changeId,
    appliedFiles,
    noChange: false,
    phase: next.phase,
    nextAction: next.next_action.action,
  };
}
