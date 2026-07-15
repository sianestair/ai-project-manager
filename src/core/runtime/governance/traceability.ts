import type {
  ArtifactIndex,
  ContractDeclaration,
  Diagnostic,
  MarkdownRecordFact,
  TraceabilityFacts,
} from "../state/types.js";

export const DESIGN_COVERAGE_DIMENSIONS = [
  "架构与模块职责",
  "接口与协议",
  "数据",
  "交互",
  "安全",
  "运行",
  "决策记录",
] as const;

const PLACEHOLDER = /^(?:|待\S*|todo|tbd|n\/a)$/i;

export interface ContractResolution<T> {
  facts: T;
  diagnostics: Diagnostic[];
  gateDiagnostics: Diagnostic[];
}

export interface TraceabilityResolution extends ContractResolution<TraceabilityFacts> {
  requirementsGateDiagnostics: Diagnostic[];
  designGateDiagnostics: Diagnostic[];
}

export interface ApplicabilityValue {
  status: "in_scope" | "not_applicable" | "invalid";
  detail: string | null;
}

function error(code: string, path: string, message: string): Diagnostic {
  return { severity: "error", code, path, message };
}

function location(record: MarkdownRecordFact): string {
  return record.path + ":" + String(record.line);
}

function recordsByKind(
  index: ArtifactIndex,
  kind: MarkdownRecordFact["kind"],
): MarkdownRecordFact[] {
  return index.records.filter((record) => record.kind === kind);
}

export function isContractPlaceholder(value: string | undefined): boolean {
  return value === undefined || PLACEHOLDER.test(value.trim());
}

export function parseApplicabilityValue(value: string): ApplicabilityValue {
  const normalized = value.trim();
  const inScope = /^(?:涉及|in[_ -]?scope)\s*[:：]\s*(\S.*)$/i.exec(normalized);
  if (inScope?.[1] !== undefined && !isContractPlaceholder(inScope[1])) {
    return { status: "in_scope", detail: inScope[1].trim() };
  }

  const notApplicable = /^(?:不适用|not[_ -]?applicable)\s*[:：]\s*(\S.*)$/i.exec(normalized);
  if (notApplicable?.[1] !== undefined && !isContractPlaceholder(notApplicable[1])) {
    return { status: "not_applicable", detail: notApplicable[1].trim() };
  }

  return { status: "invalid", detail: null };
}

function resolveDesignCoverage(declarations: readonly ContractDeclaration[]): {
  ready: boolean;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];

  for (const name of DESIGN_COVERAGE_DIMENSIONS) {
    const matches = declarations.filter((declaration) => declaration.name === name);
    if (matches.length === 0) {
      diagnostics.push(
        error(
          "design_coverage_missing",
          "design/README.md",
          "Design coverage must declare " + name + " as 涉及 or 不适用 with a reason.",
        ),
      );
      continue;
    }
    if (matches.length > 1) {
      diagnostics.push(
        error(
          "design_coverage_duplicate",
          matches.map((match) => match.path + ":" + String(match.line)).join(", "),
          "Design coverage dimension " + name + " must be declared exactly once.",
        ),
      );
      continue;
    }

    const declaration = matches[0];
    if (
      declaration !== undefined &&
      parseApplicabilityValue(declaration.value).status === "invalid"
    ) {
      diagnostics.push(
        error(
          "design_coverage_invalid",
          declaration.path + ":" + String(declaration.line),
          "Design coverage " + name + " must use '涉及：reason' or '不适用：reason'.",
        ),
      );
    }
  }

  return { ready: diagnostics.length === 0, diagnostics };
}

function appendDanglingReferenceDiagnostics(
  records: readonly MarkdownRecordFact[],
  ids: ReadonlySet<string>,
): { dangling: string[]; diagnostics: Diagnostic[] } {
  const dangling = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const record of records) {
    for (const reference of record.references) {
      if (ids.has(reference)) {
        continue;
      }
      dangling.add(reference);
      diagnostics.push(
        error(
          "artifact_reference_dangling",
          location(record),
          record.id + " references missing artifact " + reference + ".",
        ),
      );
    }
  }
  return { dangling: [...dangling].sort(), diagnostics };
}

function referencesKind(
  record: MarkdownRecordFact,
  idsByKind: ReadonlyMap<MarkdownRecordFact["kind"], ReadonlySet<string>>,
  kind: MarkdownRecordFact["kind"],
): boolean {
  const ids = idsByKind.get(kind) ?? new Set<string>();
  return record.references.some((reference) => ids.has(reference));
}

export function resolveTraceability(index: ArtifactIndex): TraceabilityResolution {
  const diagnostics: Diagnostic[] = [];
  const requirementsGateDiagnostics: Diagnostic[] = [];
  const designGateDiagnostics: Diagnostic[] = [];
  const ids = new Set(index.records.map((record) => record.id));
  const duplicateIds = [
    ...new Set(
      index.records
        .filter((record, position, values) =>
          values.some(
            (candidate, indexPosition) => candidate.id === record.id && indexPosition !== position,
          ),
        )
        .map((record) => record.id),
    ),
  ].sort();
  const idsByKind = new Map<MarkdownRecordFact["kind"], ReadonlySet<string>>();
  for (const kind of [
    "requirement",
    "acceptance",
    "design",
    "task",
    "evidence",
    "knowledge",
  ] as const) {
    idsByKind.set(kind, new Set(recordsByKind(index, kind).map((record) => record.id)));
  }

  const danglingResult = appendDanglingReferenceDiagnostics(index.records, ids);
  diagnostics.push(...danglingResult.diagnostics);

  const requirements = recordsByKind(index, "requirement");
  const acceptance = recordsByKind(index, "acceptance");
  if (requirements.length === 0) {
    requirementsGateDiagnostics.push(
      error(
        "requirements_record_missing",
        "requirements.md",
        "At least one REQ-* record is required.",
      ),
    );
  }
  if (acceptance.length === 0) {
    requirementsGateDiagnostics.push(
      error(
        "acceptance_record_missing",
        "requirements.md",
        "At least one AC-* record is required.",
      ),
    );
  }
  for (const criterion of acceptance) {
    if (!referencesKind(criterion, idsByKind, "requirement")) {
      requirementsGateDiagnostics.push(
        error(
          "acceptance_requirement_reference_missing",
          location(criterion),
          criterion.id + " must reference at least one existing REQ-*.",
        ),
      );
    }
  }

  const designCoverage = resolveDesignCoverage(index.design_coverage);
  const design = recordsByKind(index, "design");
  if (design.length === 0) {
    designGateDiagnostics.push(
      error("design_record_missing", "design/README.md", "At least one DES-* record is required."),
    );
  }
  for (const decision of design) {
    if (!referencesKind(decision, idsByKind, "requirement")) {
      designGateDiagnostics.push(
        error(
          "design_requirement_reference_missing",
          location(decision),
          decision.id + " must reference at least one existing REQ-*.",
        ),
      );
    }
  }
  const uncoveredRequirementsByDesign = requirements
    .filter(
      (requirement) => !design.some((decision) => decision.references.includes(requirement.id)),
    )
    .map((requirement) => requirement.id)
    .sort();
  for (const requirementId of uncoveredRequirementsByDesign) {
    designGateDiagnostics.push(
      error(
        "requirement_uncovered_by_design",
        requirementId,
        requirementId + " must be referenced by at least one DES-* record.",
      ),
    );
  }
  designGateDiagnostics.push(...designCoverage.diagnostics);

  const knowledge = recordsByKind(index, "knowledge");
  const knowledgeReady =
    knowledge.length > 0 &&
    knowledge.every((record) =>
      record.references.some((reference) => {
        const target = index.records.find((candidate) => candidate.id === reference);
        return target !== undefined && target.kind !== "knowledge";
      }),
    );

  const requirementsReady =
    requirements.length > 0 &&
    acceptance.length > 0 &&
    acceptance.every((criterion) => referencesKind(criterion, idsByKind, "requirement")) &&
    duplicateIds.length === 0 &&
    danglingResult.dangling.length === 0;
  const designReady =
    requirementsReady &&
    design.length > 0 &&
    design.every((decision) => referencesKind(decision, idsByKind, "requirement")) &&
    uncoveredRequirementsByDesign.length === 0 &&
    designCoverage.ready;

  return {
    facts: {
      requirements_ready: requirementsReady,
      design_ready: designReady,
      design_scope_ready: designCoverage.ready,
      knowledge_ready: knowledgeReady,
      uncovered_requirements_by_design: uncoveredRequirementsByDesign,
      dangling_references: danglingResult.dangling,
      duplicate_ids: duplicateIds,
    },
    diagnostics,
    gateDiagnostics: [...requirementsGateDiagnostics, ...designGateDiagnostics],
    requirementsGateDiagnostics,
    designGateDiagnostics,
  };
}
