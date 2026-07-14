import { access, readdir } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import type { ChangeState, ProjectConfig } from "../state/types.js";
import { validateChangeState, validateProjectConfig } from "../state/schema.js";
import { readYamlFile } from "./io.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findProjectRoot(explicitProject?: string): Promise<string> {
  if (explicitProject !== undefined) {
    const root = resolve(explicitProject);
    if (!(await pathExists(join(root, "PROJECT.yaml")))) {
      throw new PmError(
        "project_not_initialized",
        "PROJECT.yaml was not found at " + root + ".",
        EXIT_CODES.usage,
      );
    }
    return root;
  }

  let current = resolve(process.cwd());
  const filesystemRoot = parse(current).root;

  while (true) {
    if (await pathExists(join(current, "PROJECT.yaml"))) {
      return current;
    }

    if (current === filesystemRoot) {
      throw new PmError(
        "project_not_found",
        "Unable to discover a managed project from the current directory.",
        EXIT_CODES.usage,
      );
    }

    current = dirname(current);
  }
}

export async function readProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const value = await readYamlFile(join(projectRoot, "PROJECT.yaml"));
  return validateProjectConfig(value);
}

export async function listActiveChangeIds(projectRoot: string): Promise<string[]> {
  const activeRoot = join(projectRoot, "changes", "active");
  let entries;

  try {
    entries = await readdir(activeRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

export async function locateActiveChange(
  projectRoot: string,
  requestedId?: string,
): Promise<{
  changeId: string;
  changeDirectory: string;
}> {
  const activeIds = await listActiveChangeIds(projectRoot);
  let changeId = requestedId;

  if (changeId === undefined) {
    if (activeIds.length === 0) {
      throw new PmError(
        "no_active_change",
        "No active Change exists. Run pm change start <id> first.",
        EXIT_CODES.usage,
      );
    }

    if (activeIds.length > 1) {
      throw new PmError(
        "change_selection_required",
        "Multiple active Changes exist; specify the Change id.",
        EXIT_CODES.usage,
        activeIds,
      );
    }

    changeId = activeIds[0];
  }

  if (changeId === undefined || !activeIds.includes(changeId)) {
    throw new PmError(
      "active_change_not_found",
      "Active Change was not found: " + String(changeId),
      EXIT_CODES.usage,
    );
  }

  return {
    changeId,
    changeDirectory: join(projectRoot, "changes", "active", changeId),
  };
}

export async function readChangeState(changeDirectory: string): Promise<ChangeState> {
  const value = await readYamlFile(join(changeDirectory, "change.yaml"));
  return validateChangeState(value);
}
