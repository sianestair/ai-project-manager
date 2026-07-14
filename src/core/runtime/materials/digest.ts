import { createHash } from "node:crypto";
import { extname } from "node:path";
import { readFile } from "node:fs/promises";

import type { ArtifactDigest } from "../state/types.js";

const TEXT_EXTENSIONS = new Set([".json", ".md", ".patch", ".yaml", ".yml"]);

export function normalizeTextContent(content: string): string {
  const withoutBom = content.startsWith("\uFEFF") ? content.slice(1) : content;
  return withoutBom.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

export function digestBytes(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function digestText(content: string): string {
  return digestBytes(Buffer.from(normalizeTextContent(content), "utf8"));
}

export async function digestFile(path: string): Promise<string> {
  const content = await readFile(path);
  if (TEXT_EXTENSIONS.has(extname(path).toLowerCase())) {
    return digestText(content.toString("utf8"));
  }

  return digestBytes(content);
}

export function digestArtifactSet(artifacts: readonly ArtifactDigest[]): string {
  const canonical = [...artifacts]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((artifact) => artifact.path + "\0" + artifact.digest)
    .join("\n");

  return digestText(canonical);
}
