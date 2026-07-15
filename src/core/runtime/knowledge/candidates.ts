import { readFile } from "node:fs/promises";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { contractReferences } from "../materials/markdown-contract.js";
import { digestText, normalizeTextContent } from "../materials/digest.js";
import { resolveExistingFile } from "../materials/paths.js";
import type {
  ArtifactIndex,
  KnowledgeOperation,
  KnowledgePatchTarget,
  MarkdownRecordFact,
} from "../state/types.js";
import { resolveKnowledgeTarget } from "./paths.js";

type KnowledgeType = "fact" | "rule" | "decision";

const TYPE_VALUES = new Map<string, KnowledgeType>([
  ["fact", "fact"],
  ["事实", "fact"],
  ["rule", "rule"],
  ["规则", "rule"],
  ["decision", "decision"],
  ["决策", "decision"],
]);
const OPERATION_VALUES = new Map<string, KnowledgeOperation>([
  ["create", "create"],
  ["新增", "create"],
  ["replace", "replace"],
  ["替换", "replace"],
  ["delete", "delete"],
  ["删除", "delete"],
]);
const HANDLING_VALUES = new Map([
  ["include", "include"],
  ["纳入", "include"],
  ["exclude", "exclude"],
  ["排除", "exclude"],
]);

function candidateError(record: MarkdownRecordFact, message: string): PmError {
  return new PmError("knowledge_candidate_invalid", message, EXIT_CODES.validation, [
    record.path + ":" + String(record.line),
    record.id,
  ]);
}

function requiredField(record: MarkdownRecordFact, name: string): string {
  const value = record.fields[name]?.trim();
  if (value === undefined || value === "" || value.startsWith("待")) {
    throw candidateError(record, record.id + " requires a resolved " + name + " field.");
  }
  return value;
}

function typePrefix(type: KnowledgeType): string {
  return (
    "knowledge-base/" + (type === "fact" ? "facts" : type === "rule" ? "rules" : "decisions") + "/"
  );
}

async function targetBeforeImage(input: {
  projectRoot: string;
  path: string;
}): Promise<{ path: string; exists: boolean; image: string | null }> {
  const target = await resolveKnowledgeTarget(input);
  return {
    path: target.path,
    exists: target.exists,
    image: target.exists ? normalizeTextContent(await readFile(target.fullPath, "utf8")) : null,
  };
}

export function hasExplicitNoKnowledgeChange(content: string): boolean {
  return /^\s*无知识变更[。.]*\s*$/mu.test(content);
}

export async function compileKnowledgeCandidates(input: {
  projectRoot: string;
  changeDirectory: string;
  index: ArtifactIndex;
  knowledgeContent: string;
}): Promise<{ targets: KnowledgePatchTarget[]; noChange: boolean }> {
  const records = input.index.records.filter((record) => record.kind === "knowledge");
  if (records.length === 0) {
    if (!hasExplicitNoKnowledgeChange(input.knowledgeContent)) {
      throw new PmError(
        "knowledge_candidate_unresolved",
        "Record resolved KNOW-* candidates or an explicit standalone 无知识变更 conclusion.",
        EXIT_CODES.blocked,
      );
    }
    return { targets: [], noChange: true };
  }

  const targets: KnowledgePatchTarget[] = [];
  for (const record of records) {
    const typeValue = requiredField(record, "类型");
    const type = TYPE_VALUES.get(typeValue.toLowerCase());
    if (type === undefined) {
      throw candidateError(
        record,
        record.id + " 类型 must be fact/事实, rule/规则, or decision/决策.",
      );
    }
    const operationValue = requiredField(record, "操作");
    const operation = OPERATION_VALUES.get(operationValue.toLowerCase());
    if (operation === undefined) {
      throw candidateError(
        record,
        record.id + " 操作 must be create/新增, replace/替换, or delete/删除.",
      );
    }
    const handlingValue = requiredField(record, "处理结果");
    const handling = HANDLING_VALUES.get(handlingValue.toLowerCase());
    if (handling === undefined) {
      throw candidateError(record, record.id + " 处理结果 must be include/纳入 or exclude/排除.");
    }
    const references = contractReferences(requiredField(record, "依据"));
    if (references.length === 0) {
      throw candidateError(
        record,
        record.id + " 依据 must reference current REQ/DES/AC/EVID records.",
      );
    }
    if (handling === "exclude") {
      continue;
    }

    const targetValue = requiredField(record, "目标");
    const before = await targetBeforeImage({ projectRoot: input.projectRoot, path: targetValue });
    if (!before.path.startsWith(typePrefix(type))) {
      throw candidateError(record, record.id + " 类型 does not match its target knowledge folder.");
    }
    if (operation === "create" && before.exists) {
      throw new PmError(
        "knowledge_target_conflict",
        "Create target already exists: " + before.path + ".",
        EXIT_CODES.conflict,
      );
    }
    if (operation !== "create" && !before.exists) {
      throw new PmError(
        "knowledge_target_conflict",
        operation + " target does not exist: " + before.path + ".",
        EXIT_CODES.conflict,
      );
    }

    const source = requiredField(record, "内容来源");
    let afterImage: string | null = null;
    if (operation === "delete") {
      if (!/^(?:无|none)$/i.test(source)) {
        throw candidateError(record, "Delete candidates must set 内容来源 to 无.");
      }
    } else {
      if (!source.replaceAll("\\", "/").startsWith("knowledge-post-images/")) {
        throw candidateError(record, "Post-images must remain under knowledge-post-images/.");
      }
      const sourcePath = await resolveExistingFile(input.changeDirectory, source);
      afterImage = normalizeTextContent(await readFile(sourcePath, "utf8"));
    }

    targets.push({
      knowledge_id: record.id,
      path: before.path,
      operation,
      before_digest: before.image === null ? "absent" : digestText(before.image),
      after_digest: afterImage === null ? "absent" : digestText(afterImage),
      before_image: before.image,
      after_image: afterImage,
    });
  }

  targets.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  if (new Set(targets.map((target) => target.path.toLowerCase())).size !== targets.length) {
    throw new PmError(
      "knowledge_target_duplicate",
      "Included knowledge candidates must not target the same path, including casing.",
      EXIT_CODES.validation,
    );
  }
  return { targets, noChange: targets.length === 0 };
}
