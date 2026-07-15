import { contractReferences } from "../materials/markdown-contract.js";
import type {
  ArtifactIndex,
  ChangeState,
  Diagnostic,
  EvidenceFact,
  MarkdownRecordFact,
  TaskContractFacts,
  VerificationDimension,
  VerificationDimensionFact,
  VerificationFacts,
} from "../state/types.js";
import {
  isContractPlaceholder,
  parseApplicabilityValue,
  type ContractResolution,
} from "./traceability.js";

export const VERIFICATION_DIMENSIONS = [
  "completeness",
  "correctness",
  "coherence",
  "engineering_quality",
] as const satisfies readonly VerificationDimension[];

const REQUIRED_EVIDENCE_FIELDS = [
  "维度",
  "追溯",
  "命令或操作",
  "工作目录或环境",
  "执行时间",
  "退出码或结果",
  "关键输出",
  "断言",
  "基线 revision",
  "最终 revision",
  "checkpoint digest",
] as const;

const DIMENSION_VALUES = new Map<string, VerificationDimension>([
  ["completeness", "completeness"],
  ["correctness", "correctness"],
  ["coherence", "coherence"],
  ["engineering quality", "engineering_quality"],
  ["engineering_quality", "engineering_quality"],
]);

function error(code: string, path: string, message: string): Diagnostic {
  return { severity: "error", code, path, message };
}

function location(record: MarkdownRecordFact): string {
  return record.path + ":" + String(record.line);
}

function readDimension(value: string | undefined): VerificationDimension | null {
  if (value === undefined) {
    return null;
  }
  return DIMENSION_VALUES.get(value.trim().toLowerCase()) ?? null;
}

function validTimestamp(value: string | undefined): string | null {
  if (value === undefined || isContractPlaceholder(value)) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function resolveEvidence(input: { index: ArtifactIndex; state: ChangeState }): {
  facts: EvidenceFact[];
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const facts: EvidenceFact[] = [];
  const evidenceRecords = input.index.records.filter((record) => record.kind === "evidence");
  const traceableIds = new Set(
    input.index.records
      .filter((record) => ["requirement", "acceptance", "design", "task"].includes(record.kind))
      .map((record) => record.id),
  );

  for (const record of evidenceRecords) {
    const recordDiagnostics: Diagnostic[] = [];
    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      if (isContractPlaceholder(record.fields[field])) {
        recordDiagnostics.push(
          error(
            "evidence_field_missing",
            location(record),
            record.id + " requires a non-placeholder " + field + " field.",
          ),
        );
      }
    }

    const dimension = readDimension(record.fields["维度"]);
    if (record.fields["维度"] !== undefined && dimension === null) {
      recordDiagnostics.push(
        error(
          "evidence_dimension_invalid",
          location(record),
          record.id + " must use one of the four fixed verification dimensions.",
        ),
      );
    }

    const traceability = contractReferences(record.fields["追溯"] ?? "");
    if (traceability.length === 0) {
      recordDiagnostics.push(
        error(
          "evidence_traceability_missing",
          location(record),
          record.id + " must trace to current REQ-*, AC-*, DES-*, or TASK-* records.",
        ),
      );
    }
    for (const reference of traceability) {
      if (!traceableIds.has(reference)) {
        recordDiagnostics.push(
          error(
            "evidence_traceability_invalid",
            location(record),
            record.id + " traceability target " + reference + " is not a current delivery target.",
          ),
        );
      }
    }

    const executedAt = validTimestamp(record.fields["执行时间"]);
    if (record.fields["执行时间"] !== undefined && executedAt === null) {
      recordDiagnostics.push(
        error(
          "evidence_timestamp_invalid",
          location(record),
          record.id + " execution time must be an ISO-8601 timestamp.",
        ),
      );
    }

    let fresh = executedAt !== null;
    if (executedAt !== null && Date.parse(executedAt) < Date.parse(input.state.base.captured_at)) {
      fresh = false;
      recordDiagnostics.push(
        error(
          "evidence_predates_change",
          location(record),
          record.id + " predates the current Change baseline.",
        ),
      );
    }
    const checkpointAt = input.state.implementation.checkpoint.captured_at;
    if (
      executedAt !== null &&
      checkpointAt !== null &&
      Date.parse(executedAt) < Date.parse(checkpointAt)
    ) {
      fresh = false;
      recordDiagnostics.push(
        error(
          "evidence_predates_checkpoint",
          location(record),
          record.id + " predates the current implementation checkpoint.",
        ),
      );
    }

    const revisionBindings = [
      ["基线 revision", input.state.implementation.baseline_revision],
      ["最终 revision", input.state.implementation.final_revision],
      ["checkpoint digest", input.state.implementation.checkpoint.scope_digest],
    ] as const;
    for (const [field, expected] of revisionBindings) {
      const actual = record.fields[field]?.trim();
      if (expected === null || actual !== expected) {
        fresh = false;
        recordDiagnostics.push(
          error(
            "evidence_revision_binding_invalid",
            location(record),
            record.id + " " + field + " must equal the current implementation state value.",
          ),
        );
      }
    }

    diagnostics.push(...recordDiagnostics);
    facts.push({
      id: record.id,
      path: record.path,
      line: record.line,
      dimension,
      traceability,
      executed_at: executedAt,
      fresh,
      valid: recordDiagnostics.length === 0,
    });
  }

  return { facts, diagnostics };
}

function resolveDimensions(
  index: ArtifactIndex,
  evidence: readonly EvidenceFact[],
): { facts: VerificationDimensionFact[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const facts: VerificationDimensionFact[] = [];

  for (const dimension of VERIFICATION_DIMENSIONS) {
    const matches = index.verification_dimensions.filter(
      (declaration) => declaration.name === dimension,
    );
    if (matches.length === 0) {
      diagnostics.push(
        error(
          "verification_dimension_missing",
          "delivery/README.md",
          "Verification must declare " + dimension + ".",
        ),
      );
      facts.push({
        dimension,
        status: "missing",
        evidence_ids: [],
        reason: null,
        path: null,
        line: null,
      });
      continue;
    }
    if (matches.length > 1) {
      diagnostics.push(
        error(
          "verification_dimension_duplicate",
          matches.map((match) => match.path + ":" + String(match.line)).join(", "),
          "Verification dimension " + dimension + " must be declared exactly once.",
        ),
      );
      const first = matches[0];
      facts.push({
        dimension,
        status: "invalid",
        evidence_ids: [],
        reason: null,
        path: first?.path ?? null,
        line: first?.line ?? null,
      });
      continue;
    }

    const declaration = matches[0];
    if (declaration === undefined) {
      continue;
    }
    const applicability = parseApplicabilityValue(declaration.value);
    if (applicability.status === "not_applicable") {
      facts.push({
        dimension,
        status: "not_applicable",
        evidence_ids: [],
        reason: applicability.detail,
        path: declaration.path,
        line: declaration.line,
      });
      continue;
    }

    const evidenceIds = contractReferences(declaration.value).filter((id) =>
      id.startsWith("EVID-"),
    );
    const invalidIds = evidenceIds.filter(
      (id) =>
        !evidence.some((candidate) => candidate.id === id && candidate.dimension === dimension),
    );
    if (evidenceIds.length === 0 || invalidIds.length > 0) {
      diagnostics.push(
        error(
          "verification_dimension_invalid",
          declaration.path + ":" + String(declaration.line),
          evidenceIds.length === 0
            ? "Verification dimension " +
                dimension +
                " must reference EVID-* or use 不适用：reason."
            : "Verification dimension " +
                dimension +
                " has missing or mismatched evidence: " +
                invalidIds.join(", ") +
                ".",
        ),
      );
      facts.push({
        dimension,
        status: "invalid",
        evidence_ids: evidenceIds,
        reason: null,
        path: declaration.path,
        line: declaration.line,
      });
      continue;
    }

    facts.push({
      dimension,
      status: "covered",
      evidence_ids: evidenceIds,
      reason: null,
      path: declaration.path,
      line: declaration.line,
    });
  }

  return { facts, diagnostics };
}

export function resolveVerification(input: {
  index: ArtifactIndex;
  tasks: TaskContractFacts;
  state: ChangeState;
  currentRevision?: string | null;
}): ContractResolution<VerificationFacts> {
  const evidenceResult = resolveEvidence(input);
  const dimensionResult = resolveDimensions(input.index, evidenceResult.facts);
  const diagnostics = [...evidenceResult.diagnostics];
  const gateDiagnostics = [...dimensionResult.diagnostics];
  const requiredTargets = input.index.records.filter((record) =>
    ["requirement", "acceptance", "design", "task"].includes(record.kind),
  );
  const uncovered = requiredTargets.filter(
    (record) => !evidenceResult.facts.some((evidence) => evidence.traceability.includes(record.id)),
  );
  for (const record of uncovered) {
    gateDiagnostics.push(
      error(
        "artifact_uncovered_by_evidence",
        record.id,
        record.id + " must be referenced by at least one current EVID-* record.",
      ),
    );
  }
  if (evidenceResult.facts.length === 0) {
    gateDiagnostics.push(
      error(
        "evidence_record_missing",
        "delivery/README.md",
        "At least one EVID-* record is required.",
      ),
    );
  }
  if (!input.tasks.all_completed) {
    gateDiagnostics.push(
      error(
        "tasks_not_completed",
        "delivery/README.md",
        "Every valid TASK-* record must be completed before acceptance preparation.",
      ),
    );
  }
  if (input.state.implementation.status !== "verified") {
    gateDiagnostics.push(
      error(
        "implementation_not_verified",
        "implementation.status",
        "Implementation state must be verified before acceptance preparation.",
      ),
    );
  }
  if (
    input.currentRevision !== undefined &&
    input.currentRevision !== null &&
    input.state.implementation.final_revision !== input.currentRevision
  ) {
    gateDiagnostics.push(
      error(
        "implementation_final_revision_not_current",
        "implementation.final_revision",
        "The final implementation revision must equal the current Git revision.",
      ),
    );
  }

  const structurallyComplete =
    dimensionResult.facts.length === VERIFICATION_DIMENSIONS.length &&
    dimensionResult.facts.every((dimension) =>
      ["covered", "not_applicable"].includes(dimension.status),
    ) &&
    evidenceResult.facts.length > 0 &&
    evidenceResult.facts.every((evidence) => evidence.valid);
  const evidenceFresh =
    evidenceResult.facts.length > 0 && evidenceResult.facts.every((evidence) => evidence.fresh);
  const traceabilityComplete = requiredTargets.length > 0 && uncovered.length === 0;
  const readyForAcceptance =
    structurallyComplete &&
    evidenceFresh &&
    traceabilityComplete &&
    input.tasks.all_completed &&
    input.state.implementation.status === "verified" &&
    input.state.implementation.baseline_revision !== null &&
    input.state.implementation.final_revision !== null &&
    (input.currentRevision === undefined ||
      input.currentRevision === null ||
      input.state.implementation.final_revision === input.currentRevision) &&
    input.state.implementation.checkpoint.scope_digest !== null &&
    input.state.implementation.checkpoint.captured_at !== null;

  return {
    facts: {
      dimensions: dimensionResult.facts,
      evidence: evidenceResult.facts,
      structurally_complete: structurallyComplete,
      evidence_fresh: evidenceFresh,
      traceability_complete: traceabilityComplete,
      ready_for_acceptance: readyForAcceptance,
    },
    diagnostics,
    gateDiagnostics,
  };
}
