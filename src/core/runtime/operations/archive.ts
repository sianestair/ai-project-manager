import { access, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { findProjectRoot, locateActiveChange, readChangeState } from "../project/discover.js";
import { writeTextAtomic, writeYamlAtomic } from "../project/io.js";
import { resolveCanonicalState } from "../state/resolver.js";
import { validateChangeState } from "../state/schema.js";
import type { ChangeState, GateName } from "../state/types.js";

const ARCHIVE_MARKER = ".pm-archive.json";

export class SimulatedArchiveInterruption extends Error {
  constructor(message = "Simulated archive interruption.") {
    super(message);
    this.name = "SimulatedArchiveInterruption";
  }
}

export interface ArchiveHooks {
  renameDirectory?(source: string, target: string): Promise<void>;
  afterMarkerWrite?(): Promise<void> | void;
  afterRename?(): Promise<void> | void;
  afterTerminalWrite?(): Promise<void> | void;
}

interface ArchiveMarker {
  schema_version: 1;
  change_id: string;
  terminal_state: ChangeState;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function markerIsValid(value: unknown): value is ArchiveMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Partial<ArchiveMarker>).schema_version === 1 &&
    typeof (value as Partial<ArchiveMarker>).change_id === "string" &&
    typeof (value as Partial<ArchiveMarker>).terminal_state === "object" &&
    (value as Partial<ArchiveMarker>).terminal_state !== null
  );
}

async function readArchiveMarker(directory: string): Promise<ArchiveMarker> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(join(directory, ARCHIVE_MARKER), "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown archive marker error.";
    throw new PmError(
      "archive_recovery_invalid",
      "Unable to read archive recovery marker.",
      EXIT_CODES.validation,
      [message],
    );
  }
  if (!markerIsValid(value)) {
    throw new PmError(
      "archive_recovery_invalid",
      "Archive recovery marker has an invalid structure.",
      EXIT_CODES.validation,
    );
  }
  await validateChangeState(value.terminal_state);
  if (
    value.change_id !== value.terminal_state.change_id ||
    value.terminal_state.phase !== "archived" ||
    value.terminal_state.status !== "completed"
  ) {
    throw new PmError(
      "archive_recovery_invalid",
      "Archive recovery marker does not contain a terminal state for this Change.",
      EXIT_CODES.validation,
    );
  }
  return value;
}

function confirmationRevisions(state: ChangeState): Record<GateName, number> {
  return {
    requirements: state.gates.requirements.confirmations.at(-1)?.revision ?? 0,
    design: state.gates.design.confirmations.at(-1)?.revision ?? 0,
    acceptance: state.gates.acceptance.confirmations.at(-1)?.revision ?? 0,
    knowledge: state.gates.knowledge.confirmations.at(-1)?.revision ?? 0,
  };
}

function createTerminalState(state: ChangeState, archivedAt: string): ChangeState {
  if (state.implementation.final_revision === null) {
    throw new PmError(
      "archive_final_revision_missing",
      "A terminal archive requires final_revision.",
      EXIT_CODES.blocked,
    );
  }
  const next = structuredClone(state);
  next.phase = "archived";
  next.status = "completed";
  next.archive = {
    archived_at: archivedAt,
    final_revision: state.implementation.final_revision,
    applied_files: structuredClone(state.knowledge_promotion.applied_files),
    confirmation_revisions: confirmationRevisions(state),
  };
  next.next_action = {
    owner: "ai_project_manager",
    action: "inspect_archive",
    inputs: ["change.yaml"],
  };
  next.history.push({
    at: archivedAt,
    event: "change_archived",
    summary: "Recorded terminal references and archived the complete Change directory.",
  });
  return next;
}

export interface ArchiveCheckResult {
  changeId: string;
  ready: boolean;
  unmetConditions: string[];
}

export async function checkArchive(input: {
  project?: string;
  changeId: string;
}): Promise<ArchiveCheckResult> {
  const state = await resolveCanonicalState({
    ...(input.project === undefined ? {} : { project: input.project }),
    changeId: input.changeId,
  });
  return {
    changeId: state.change.change_id,
    ready: state.archive_readiness.ready,
    unmetConditions: [...state.archive_readiness.unmet_conditions],
  };
}

async function finishArchive(input: {
  activeDirectory: string;
  archivedDirectory: string;
  marker: ArchiveMarker;
  hooks: ArchiveHooks;
}): Promise<void> {
  let moved = false;
  let terminalWritten = false;
  const renameDirectory = async (source: string, target: string): Promise<void> => {
    if (input.hooks.renameDirectory === undefined) {
      await rename(source, target);
    } else {
      await input.hooks.renameDirectory(source, target);
    }
  };
  try {
    if (await exists(input.activeDirectory)) {
      if (await exists(input.archivedDirectory)) {
        throw new PmError(
          "archive_target_conflict",
          "Archived Change destination already exists.",
          EXIT_CODES.conflict,
          [input.archivedDirectory],
        );
      }
      await renameDirectory(input.activeDirectory, input.archivedDirectory);
      moved = true;
      await input.hooks.afterRename?.();
    }
    await writeYamlAtomic(
      join(input.archivedDirectory, "change.yaml"),
      input.marker.terminal_state,
    );
    terminalWritten = true;
    await input.hooks.afterTerminalWrite?.();
    await rm(join(input.archivedDirectory, ARCHIVE_MARKER), { force: true });
  } catch (error) {
    if (error instanceof SimulatedArchiveInterruption) {
      throw error;
    }
    if (terminalWritten) {
      const message = error instanceof Error ? error.message : "Unknown archive cleanup error.";
      throw new PmError(
        "archive_recovery_required",
        "Archive terminal state was committed, but marker cleanup requires recovery.",
        EXIT_CODES.internal,
        [message],
      );
    }
    if (moved && !(await exists(input.activeDirectory))) {
      try {
        await renameDirectory(input.archivedDirectory, input.activeDirectory);
      } catch (rollbackError) {
        const message =
          rollbackError instanceof Error ? rollbackError.message : "Unknown rollback error.";
        throw new PmError(
          "archive_recovery_required",
          "Archive failed after rename and could not restore the active Change.",
          EXIT_CODES.internal,
          [message],
        );
      }
    }
    throw error;
  }
}

export interface ArchiveApplyResult {
  changeId: string;
  archivedPath: string;
  archivedAt: string;
  recovered: boolean;
}

export async function archiveChange(
  input: { project?: string; changeId: string },
  hooks: ArchiveHooks = {},
  now: () => string = () => new Date().toISOString(),
): Promise<ArchiveApplyResult> {
  const projectRoot = await findProjectRoot(input.project);
  const activeDirectory = join(projectRoot, "changes", "active", input.changeId);
  const archivedDirectory = join(projectRoot, "changes", "archived", input.changeId);
  const activeMarker = join(activeDirectory, ARCHIVE_MARKER);
  const archivedMarker = join(archivedDirectory, ARCHIVE_MARKER);

  if (await exists(activeMarker)) {
    const marker = await readArchiveMarker(activeDirectory);
    await finishArchive({ activeDirectory, archivedDirectory, marker, hooks });
    return {
      changeId: input.changeId,
      archivedPath: "changes/archived/" + input.changeId,
      archivedAt: marker.terminal_state.archive?.archived_at ?? now(),
      recovered: true,
    };
  }
  if (await exists(archivedMarker)) {
    const marker = await readArchiveMarker(archivedDirectory);
    await finishArchive({ activeDirectory, archivedDirectory, marker, hooks });
    return {
      changeId: input.changeId,
      archivedPath: "changes/archived/" + input.changeId,
      archivedAt: marker.terminal_state.archive?.archived_at ?? now(),
      recovered: true,
    };
  }

  const located = await locateActiveChange(projectRoot, input.changeId);
  if (await exists(archivedDirectory)) {
    throw new PmError(
      "archive_target_conflict",
      "Archived Change destination already exists.",
      EXIT_CODES.conflict,
      [archivedDirectory],
    );
  }
  const resolved = await resolveCanonicalState({ project: projectRoot, changeId: input.changeId });
  if (!resolved.available_actions.some((action) => action.id === "archive")) {
    throw new PmError(
      "archive_blocked",
      "Change does not satisfy every terminal archive condition.",
      EXIT_CODES.blocked,
      resolved.archive_readiness.unmet_conditions,
    );
  }

  const state = await readChangeState(located.changeDirectory);
  const terminalState = createTerminalState(state, now());
  await validateChangeState(terminalState);
  const marker: ArchiveMarker = {
    schema_version: 1,
    change_id: input.changeId,
    terminal_state: terminalState,
  };
  await writeTextAtomic(activeMarker, JSON.stringify(marker, null, 2) + "\n");
  await hooks.afterMarkerWrite?.();
  await finishArchive({ activeDirectory, archivedDirectory, marker, hooks });
  return {
    changeId: input.changeId,
    archivedPath: "changes/archived/" + input.changeId,
    archivedAt: terminalState.archive?.archived_at ?? now(),
    recovered: false,
  };
}
