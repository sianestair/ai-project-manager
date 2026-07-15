import { spawnSync } from "node:child_process";
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

import { digestArtifactSet, digestFile } from "../materials/digest.js";
import { normalizeRelativePath, resolveExistingFile, resolveWithin } from "../materials/paths.js";

const FALLBACK_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".pnpm-store",
  ".yarn",
  "node_modules",
]);

export interface GitWorkspaceChange {
  path: string;
  status: string;
}

export interface GitWorkspaceSnapshot {
  available: boolean;
  revision: string | null;
  changes: GitWorkspaceChange[];
}

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

function runGit(projectRoot: string, args: readonly string[]) {
  return spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function normalizeGitPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function getGitRevision(projectRoot: string): string | null {
  const result = runGit(projectRoot, ["rev-parse", "HEAD"]);

  if (result.status !== 0) {
    return null;
  }

  const revision = result.stdout.trim();
  return revision === "" ? null : revision;
}

export function getGitWorkspaceSnapshot(projectRoot: string): GitWorkspaceSnapshot {
  const result = runGit(projectRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--ignored=no",
  ]);

  if (result.status !== 0) {
    return { available: false, revision: null, changes: [] };
  }

  const tokens = result.stdout.split("\0");
  const changes: GitWorkspaceChange[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token === "") {
      continue;
    }

    const status = token.slice(0, 2);
    const path = token.slice(3);
    changes.push({ path: normalizeGitPath(path), status });

    if (status.includes("R") || status.includes("C")) {
      const source = tokens[index + 1];
      if (source !== undefined && source !== "") {
        changes.push({ path: normalizeGitPath(source), status });
        index += 1;
      }
    }
  }

  changes.sort((left, right) =>
    left.path < right.path
      ? -1
      : left.path > right.path
        ? 1
        : left.status.localeCompare(right.status),
  );

  return {
    available: true,
    revision: getGitRevision(projectRoot),
    changes,
  };
}

async function validateProjectEntry(projectRoot: string, path: string) {
  const candidate = resolveWithin(projectRoot, path);
  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink() || (!metadata.isFile() && !metadata.isDirectory())) {
    throw new Error("Project dependency must be a regular file or directory: " + path);
  }

  const [rootRealPath, candidateRealPath] = await Promise.all([
    realpath(projectRoot),
    realpath(candidate),
  ]);
  if (!isWithin(comparable(rootRealPath), comparable(candidateRealPath))) {
    throw new Error("Project dependency escapes the project root: " + path);
  }

  return { candidate, metadata };
}

function gitFilesInScope(projectRoot: string, scope: string): string[] | null {
  const result = runGit(projectRoot, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    scope,
  ]);
  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split("\0")
    .filter((path) => path !== "")
    .map(normalizeGitPath)
    .sort();
}

async function fallbackFilesInScope(
  projectRoot: string,
  directory: string,
  relativeDirectory: string,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (
      entry.isSymbolicLink() ||
      entry.name.startsWith(".pm-tmp-") ||
      (entry.isDirectory() && FALLBACK_EXCLUDED_DIRECTORIES.has(entry.name))
    ) {
      continue;
    }

    const relativePath =
      relativeDirectory === "" ? entry.name : relativeDirectory + "/" + entry.name;
    const fullPath = resolveWithin(projectRoot, relativePath);
    if (entry.isDirectory()) {
      files.push(...(await fallbackFilesInScope(projectRoot, fullPath, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

export async function digestProjectScope(projectRoot: string, inputPath: string): Promise<string> {
  const path = normalizeRelativePath(inputPath);
  const { candidate, metadata } = await validateProjectEntry(projectRoot, path);

  if (metadata.isFile()) {
    return digestFile(candidate);
  }

  const gitFiles = gitFilesInScope(projectRoot, path);
  const files =
    gitFiles ?? (await fallbackFilesInScope(projectRoot, candidate, path === "." ? "" : path));
  const artifacts = await Promise.all(
    files.map(async (file) => ({
      path: file,
      digest: await digestFile(await resolveExistingFile(projectRoot, file)),
    })),
  );

  return digestArtifactSet(artifacts);
}
