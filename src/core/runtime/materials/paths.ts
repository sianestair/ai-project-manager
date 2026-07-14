import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { posix } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";

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

export function normalizeRelativePath(path: string): string {
  if (path.includes("\0") || path.trim() === "") {
    throw new PmError(
      "unsafe_path",
      "Material path must be a non-empty relative path.",
      EXIT_CODES.validation,
    );
  }

  const slashPath = path.replaceAll("\\", "/");
  if (isAbsolute(path) || slashPath.startsWith("/") || /^[a-zA-Z]:\//.test(slashPath)) {
    throw new PmError(
      "unsafe_path",
      "Absolute material paths are not allowed: " + path,
      EXIT_CODES.validation,
    );
  }

  const normalized = posix.normalize(slashPath);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new PmError(
      "unsafe_path",
      "Material path escapes its Change directory: " + path,
      EXIT_CODES.validation,
    );
  }

  return normalized;
}

export function resolveWithin(root: string, path: string): string {
  const normalized = normalizeRelativePath(path);
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, ...normalized.split("/"));

  if (!isWithin(comparable(rootPath), comparable(candidate))) {
    throw new PmError(
      "unsafe_path",
      "Resolved material path escapes its Change directory: " + path,
      EXIT_CODES.validation,
    );
  }

  return candidate;
}

export async function resolveExistingFile(root: string, path: string): Promise<string> {
  const candidate = resolveWithin(root, path);
  const metadata = await lstat(candidate);

  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new PmError(
      "unsafe_material_type",
      "Material must be a regular file and cannot be a symlink: " + path,
      EXIT_CODES.validation,
    );
  }

  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);

  if (!isWithin(comparable(realRoot), comparable(realCandidate))) {
    throw new PmError(
      "unsafe_path",
      "Material symlink chain escapes its Change directory: " + path,
      EXIT_CODES.validation,
    );
  }

  return candidate;
}
