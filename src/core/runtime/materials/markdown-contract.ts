import { readFile } from "node:fs/promises";

import { resolveExistingFile } from "./paths.js";
import type {
  ArtifactIndex,
  ArtifactRecordKind,
  ContractDeclaration,
  Diagnostic,
  MarkdownRecordFact,
  MaterialSetName,
  ResolvedMaterialSet,
} from "../state/types.js";

const RECORD_HEADING =
  /^(###)\s+((REQ|AC|DES|TASK|EVID|KNOW)-[A-Z0-9]+(?:-[A-Z0-9]+)*)\s*[:：]\s*(\S.*)$/;
const POSSIBLE_RECORD_HEADING = /^(#{1,6})\s+(REQ|AC|DES|TASK|EVID|KNOW)-/i;
const FIELD_LINE = /^-\s+([^:：]+)[:：]\s*(.*)$/;
const REFERENCE = /\b(?:REQ|AC|DES|TASK|EVID|KNOW)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;

const PREFIX_KIND: Record<string, ArtifactRecordKind> = {
  REQ: "requirement",
  AC: "acceptance",
  DES: "design",
  TASK: "task",
  EVID: "evidence",
  KNOW: "knowledge",
};

const EXPECTED_MATERIAL: Record<ArtifactRecordKind, MaterialSetName> = {
  requirement: "requirements",
  acceptance: "requirements",
  design: "design",
  task: "delivery",
  evidence: "delivery",
  knowledge: "knowledge",
};

const DESIGN_COVERAGE_NAMES = new Set([
  "架构与模块职责",
  "接口与协议",
  "数据",
  "交互",
  "安全",
  "运行",
  "决策记录",
]);

const VERIFICATION_DIMENSION_NAMES = new Map([
  ["completeness", "completeness"],
  ["correctness", "correctness"],
  ["coherence", "coherence"],
  ["engineering quality", "engineering_quality"],
]);

function error(code: string, path: string, message: string): Diagnostic {
  return { severity: "error", code, path, message };
}

export function normalizeContractFieldName(name: string): string {
  return name.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

export function contractReferences(value: string): string[] {
  return [...new Set(value.match(REFERENCE) ?? [])].sort();
}

function withoutCodeFences(content: string): string[] {
  const lines = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return "";
    }
    return fenced ? "" : line;
  });
}

function parseDocument(input: { path: string; material: MaterialSetName; content: string }): {
  records: MarkdownRecordFact[];
  designCoverage: ContractDeclaration[];
  verificationDimensions: ContractDeclaration[];
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const records: MarkdownRecordFact[] = [];
  const designCoverage: ContractDeclaration[] = [];
  const verificationDimensions: ContractDeclaration[] = [];
  const lines = withoutCodeFences(input.content);

  for (const [index, line] of lines.entries()) {
    const field = FIELD_LINE.exec(line.trim());
    if (field?.[1] !== undefined && field[2] !== undefined) {
      const name = field[1].trim();
      const value = field[2].trim();
      if (input.material === "design" && DESIGN_COVERAGE_NAMES.has(name)) {
        designCoverage.push({ name, value, path: input.path, line: index + 1 });
      }
      if (input.material === "delivery") {
        const dimension = VERIFICATION_DIMENSION_NAMES.get(name.toLowerCase());
        if (dimension !== undefined) {
          verificationDimensions.push({
            name: dimension,
            value,
            path: input.path,
            line: index + 1,
          });
        }
      }
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = RECORD_HEADING.exec(line.trim());
    if (match === null) {
      if (POSSIBLE_RECORD_HEADING.test(line.trim())) {
        diagnostics.push(
          error(
            "artifact_heading_malformed",
            input.path + ":" + String(index + 1),
            "Artifact headings must use '### PREFIX-001: title' with an uppercase stable id.",
          ),
        );
      }
      continue;
    }

    const id = match[2];
    const prefix = match[3];
    const title = match[4];
    if (id === undefined || prefix === undefined || title === undefined) {
      continue;
    }
    const kind = PREFIX_KIND[prefix];
    if (kind === undefined) {
      continue;
    }

    const fields: Record<string, string> = {};
    const body: string[] = [];
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const bodyLine = lines[bodyIndex] ?? "";
      if (/^#{1,6}\s+/.test(bodyLine.trim())) {
        break;
      }
      body.push(bodyLine);
      const field = FIELD_LINE.exec(bodyLine.trim());
      if (field?.[1] === undefined || field[2] === undefined) {
        continue;
      }
      const name = normalizeContractFieldName(field[1]);
      if (name in fields) {
        diagnostics.push(
          error(
            "artifact_field_duplicate",
            input.path + ":" + String(bodyIndex + 1),
            "Artifact " + id + " repeats field " + field[1].trim() + ".",
          ),
        );
      } else {
        fields[name] = field[2].trim();
      }
    }

    const references = contractReferences(title + "\n" + body.join("\n")).filter(
      (reference) => reference !== id,
    );
    records.push({
      id,
      kind,
      title: title.trim(),
      path: input.path,
      line: index + 1,
      fields,
      references,
    });

    if (EXPECTED_MATERIAL[kind] !== input.material) {
      diagnostics.push(
        error(
          "artifact_material_mismatch",
          input.path + ":" + String(index + 1),
          id + " belongs in the " + EXPECTED_MATERIAL[kind] + " material set.",
        ),
      );
    }
  }

  return { records, designCoverage, verificationDimensions, diagnostics };
}

export async function resolveArtifactIndex(
  changeDirectory: string,
  materials: Record<MaterialSetName, ResolvedMaterialSet>,
): Promise<{
  index: ArtifactIndex;
  diagnostics: Diagnostic[];
}> {
  const diagnostics: Diagnostic[] = [];
  const records: MarkdownRecordFact[] = [];
  const designCoverage: ContractDeclaration[] = [];
  const verificationDimensions: ContractDeclaration[] = [];

  for (const material of Object.keys(materials) as MaterialSetName[]) {
    for (const artifact of materials[material].artifacts) {
      if (!artifact.path.toLowerCase().endsWith(".md")) {
        continue;
      }
      const fullPath = await resolveExistingFile(changeDirectory, artifact.path);
      const parsed = parseDocument({
        path: artifact.path,
        material,
        content: await readFile(fullPath, "utf8"),
      });
      records.push(...parsed.records);
      designCoverage.push(...parsed.designCoverage);
      verificationDimensions.push(...parsed.verificationDimensions);
      diagnostics.push(...parsed.diagnostics);
    }
  }

  records.sort((left, right) =>
    left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : left.path < right.path
          ? -1
          : left.path > right.path
            ? 1
            : left.line - right.line,
  );
  const locations = new Map<string, MarkdownRecordFact[]>();
  for (const record of records) {
    const values = locations.get(record.id) ?? [];
    values.push(record);
    locations.set(record.id, values);
  }
  for (const [id, values] of locations) {
    if (values.length > 1) {
      diagnostics.push(
        error(
          "artifact_id_duplicate",
          values.map((record) => record.path + ":" + String(record.line)).join(", "),
          "Artifact id " + id + " must be unique within one Change.",
        ),
      );
    }
  }

  return {
    index: {
      records,
      design_coverage: designCoverage,
      verification_dimensions: verificationDimensions,
    },
    diagnostics,
  };
}
