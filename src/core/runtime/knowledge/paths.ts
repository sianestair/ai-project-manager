import { lstat, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { normalizeRelativePath, resolveWithin } from "../materials/paths.js";

function comparable(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(".." + sep) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

export function normalizeKnowledgeTargetPath(path: string): string {
  const normalized = normalizeRelativePath(path);
  if (!/^knowledge-base\/(?:facts|rules|decisions)\/.+\.md$/.test(normalized)) {
    throw new PmError(
      "knowledge_target_outside_contract",
      "Knowledge targets must be Markdown files under knowledge-base/facts, rules, or decisions.",
      EXIT_CODES.validation,
      [path],
    );
  }
  return normalized;
}

async function nearestExistingParent(path: string): Promise<string> {
  let current = dirname(path);
  while (true) {
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new PmError(
          "unsafe_knowledge_parent",
          "Knowledge target parents must be real directories.",
          EXIT_CODES.validation,
          [current],
        );
      }
      return current;
    } catch (error) {
      if (error instanceof PmError) {
        throw error;
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new PmError(
        "unsafe_knowledge_parent",
        "Unable to locate an existing parent for the knowledge target.",
        EXIT_CODES.validation,
      );
    }
    current = parent;
  }
}

async function rejectCaseConflict(fullPath: string): Promise<void> {
  const parent = dirname(fullPath);
  let entries: string[];
  try {
    entries = await readdir(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  const expected = fullPath.slice(parent.length + 1);
  const conflict = entries.find(
    (entry) => entry.toLowerCase() === expected.toLowerCase() && entry !== expected,
  );
  if (conflict !== undefined) {
    throw new PmError(
      "knowledge_target_case_conflict",
      "Knowledge target casing conflicts with an existing path.",
      EXIT_CODES.conflict,
      [conflict, expected],
    );
  }
}

export async function resolveKnowledgeTarget(input: {
  projectRoot: string;
  path: string;
}): Promise<{ path: string; fullPath: string; exists: boolean }> {
  const path = normalizeKnowledgeTargetPath(input.path);
  const fullPath = resolveWithin(input.projectRoot, path);
  const knowledgeRoot = resolve(input.projectRoot, "knowledge-base");
  const existingParent = await nearestExistingParent(fullPath);
  const [realKnowledgeRoot, realParent] = await Promise.all([
    realpath(knowledgeRoot),
    realpath(existingParent),
  ]);
  if (!isWithin(comparable(realKnowledgeRoot), comparable(realParent))) {
    throw new PmError(
      "unsafe_knowledge_target",
      "Knowledge target parent escapes knowledge-base through a symlink.",
      EXIT_CODES.validation,
      [path],
    );
  }

  await rejectCaseConflict(fullPath);
  try {
    const metadata = await lstat(fullPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new PmError(
        "unsafe_knowledge_target",
        "Existing knowledge targets must be regular files and cannot be symlinks.",
        EXIT_CODES.validation,
        [path],
      );
    }
    return { path, fullPath, exists: true };
  } catch (error) {
    if (error instanceof PmError) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, fullPath, exists: false };
    }
    throw error;
  }
}
