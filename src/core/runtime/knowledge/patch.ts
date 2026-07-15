import { readFile } from "node:fs/promises";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { digestText, normalizeTextContent } from "../materials/digest.js";
import { validateKnowledgePatch } from "../state/schema.js";
import type { KnowledgePatchEnvelope, KnowledgePatchTarget } from "../state/types.js";
import { normalizeKnowledgeTargetPath } from "./paths.js";

function semanticError(message: string, details: string[] = []): PmError {
  return new PmError("knowledge_patch_invalid", message, EXIT_CODES.validation, details);
}

function validateTarget(target: KnowledgePatchTarget): void {
  const path = normalizeKnowledgeTargetPath(target.path);
  if (path !== target.path) {
    throw semanticError("Knowledge patch target paths must be canonical.", [target.path]);
  }

  const beforeImage =
    target.before_image === null ? null : normalizeTextContent(target.before_image);
  const afterImage = target.after_image === null ? null : normalizeTextContent(target.after_image);
  if (beforeImage !== target.before_image || afterImage !== target.after_image) {
    throw semanticError("Knowledge patch images must use normalized UTF-8 text.", [target.path]);
  }

  if (target.operation === "create") {
    if (
      target.before_digest !== "absent" ||
      target.before_image !== null ||
      target.after_digest === "absent" ||
      target.after_image === null
    ) {
      throw semanticError("Create targets require absent before and concrete after images.", [
        path,
      ]);
    }
  } else if (target.operation === "replace") {
    if (
      target.before_digest === "absent" ||
      target.before_image === null ||
      target.after_digest === "absent" ||
      target.after_image === null
    ) {
      throw semanticError("Replace targets require concrete before and after images.", [path]);
    }
  } else if (
    target.before_digest === "absent" ||
    target.before_image === null ||
    target.after_digest !== "absent" ||
    target.after_image !== null
  ) {
    throw semanticError("Delete targets require a concrete before image and absent after image.", [
      path,
    ]);
  }

  if (target.before_image !== null && digestText(target.before_image) !== target.before_digest) {
    throw semanticError("Knowledge patch before image digest does not match.", [path]);
  }
  if (target.after_image !== null && digestText(target.after_image) !== target.after_digest) {
    throw semanticError("Knowledge patch after image digest does not match.", [path]);
  }
  if (target.operation === "replace" && target.before_digest === target.after_digest) {
    throw semanticError("Replace targets must change content.", [path]);
  }
}

export async function validateKnowledgePatchEnvelope(
  value: unknown,
): Promise<KnowledgePatchEnvelope> {
  const patch = await validateKnowledgePatch(value);
  const canonicalTargets = [...patch.targets].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  if (JSON.stringify(canonicalTargets) !== JSON.stringify(patch.targets)) {
    throw semanticError("Knowledge patch targets must be sorted by canonical path.");
  }
  if (
    new Set(patch.targets.map((target) => target.path.toLowerCase())).size !== patch.targets.length
  ) {
    throw semanticError("Knowledge patch target paths must be unique, including casing.");
  }
  if (new Set(patch.targets.map((target) => target.knowledge_id)).size !== patch.targets.length) {
    throw semanticError("Each included KNOW-* record may produce only one target.");
  }
  for (const target of patch.targets) {
    validateTarget(target);
  }
  return patch;
}

export function stringifyKnowledgePatch(patch: KnowledgePatchEnvelope): string {
  return JSON.stringify(patch, null, 2) + "\n";
}

export function knowledgePatchDigest(patch: KnowledgePatchEnvelope): string {
  return digestText(stringifyKnowledgePatch(patch));
}

export async function readKnowledgePatch(path: string): Promise<KnowledgePatchEnvelope> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown patch read error.";
    throw new PmError(
      "knowledge_patch_unreadable",
      "Unable to read knowledge.patch.",
      EXIT_CODES.validation,
      [message],
    );
  }
  return validateKnowledgePatchEnvelope(parsed);
}

export function renderKnowledgePatchDiff(patch: KnowledgePatchEnvelope): string {
  return patch.targets
    .map((target) => {
      const before = target.before_image?.split("\n") ?? [];
      const after = target.after_image?.split("\n") ?? [];
      return [
        "--- " + (target.before_image === null ? "/dev/null" : "a/" + target.path),
        "+++ " + (target.after_image === null ? "/dev/null" : "b/" + target.path),
        "@@ -1," + String(before.length) + " +1," + String(after.length) + " @@",
        ...before.map((line) => "-" + line),
        ...after.map((line) => "+" + line),
      ].join("\n");
    })
    .join("\n");
}
