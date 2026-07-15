import { contractReferences } from "../materials/markdown-contract.js";
import type {
  ArtifactIndex,
  Diagnostic,
  MarkdownRecordFact,
  TaskContractFact,
  TaskContractFacts,
  TaskStatus,
} from "../state/types.js";
import { isContractPlaceholder, type ContractResolution } from "./traceability.js";

const REQUIRED_FIELDS = [
  "目标",
  "追溯",
  "consumes",
  "produces",
  "预计修改范围",
  "依赖任务",
  "验证方法",
  "预期结果",
  "状态",
  "证据",
] as const;

const TASK_STATUSES = new Set<TaskStatus>(["pending", "in_progress", "completed", "blocked"]);
const EMPTY_REFERENCE_VALUE = /^(?:无|none|n\/a)$/i;

function error(code: string, path: string, message: string): Diagnostic {
  return { severity: "error", code, path, message };
}

function location(record: MarkdownRecordFact): string {
  return record.path + ":" + String(record.line);
}

function readReferences(record: MarkdownRecordFact, field: string): string[] {
  return contractReferences(record.fields[field] ?? "");
}

function readOptionalReferences(record: MarkdownRecordFact, field: string): string[] {
  const value = record.fields[field];
  if (value === undefined || EMPTY_REFERENCE_VALUE.test(value.trim())) {
    return [];
  }
  return contractReferences(value);
}

function findDependencyCycles(tasks: readonly TaskContractFact[]): string[][] {
  const dependencies = new Map(tasks.map((task) => [task.id, task.dependencies]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];

  const visit = (id: string) => {
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      cycles.push([...path.slice(start), id]);
      return;
    }
    if (visited.has(id)) {
      return;
    }

    visiting.add(id);
    path.push(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (dependencies.has(dependency)) {
        visit(dependency);
      }
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const task of tasks) {
    visit(task.id);
  }

  return cycles.filter(
    (cycle, index, values) =>
      values.findIndex(
        (candidate) => [...candidate].sort().join("|") === [...cycle].sort().join("|"),
      ) === index,
  );
}

export function resolveTaskContracts(index: ArtifactIndex): ContractResolution<TaskContractFacts> {
  const diagnostics: Diagnostic[] = [];
  const gateDiagnostics: Diagnostic[] = [];
  const taskRecords = index.records.filter((record) => record.kind === "task");
  const taskIds = new Set(taskRecords.map((record) => record.id));
  const evidenceIds = new Set(
    index.records.filter((record) => record.kind === "evidence").map((record) => record.id),
  );
  const traceableIds = new Set(
    index.records
      .filter((record) => ["requirement", "design", "acceptance"].includes(record.kind))
      .map((record) => record.id),
  );
  const facts: TaskContractFact[] = [];

  for (const record of taskRecords) {
    const recordDiagnostics: Diagnostic[] = [];
    for (const field of REQUIRED_FIELDS) {
      if (isContractPlaceholder(record.fields[field])) {
        recordDiagnostics.push(
          error(
            "task_field_missing",
            location(record),
            record.id + " requires a non-placeholder " + field + " field.",
          ),
        );
      }
    }

    const traceability = readReferences(record, "追溯");
    const dependencies = readOptionalReferences(record, "依赖任务");
    const evidence = readOptionalReferences(record, "证据");
    const rawStatus = record.fields["状态"]?.trim().toLowerCase();
    const status = TASK_STATUSES.has(rawStatus as TaskStatus) ? (rawStatus as TaskStatus) : null;

    if (traceability.length === 0) {
      recordDiagnostics.push(
        error(
          "task_traceability_missing",
          location(record),
          record.id + " must trace to REQ-*, DES-*, or AC-* records.",
        ),
      );
    }
    for (const reference of traceability) {
      if (!traceableIds.has(reference)) {
        recordDiagnostics.push(
          error(
            "task_traceability_invalid",
            location(record),
            record.id +
              " traceability target " +
              reference +
              " is not an existing REQ-*, DES-*, or AC-*.",
          ),
        );
      }
    }
    for (const dependency of dependencies) {
      if (!taskIds.has(dependency)) {
        recordDiagnostics.push(
          error(
            "task_dependency_missing",
            location(record),
            record.id + " depends on missing task " + dependency + ".",
          ),
        );
      }
      if (dependency === record.id) {
        recordDiagnostics.push(
          error("task_dependency_self", location(record), record.id + " cannot depend on itself."),
        );
      }
    }
    for (const evidenceId of evidence) {
      if (!evidenceIds.has(evidenceId)) {
        recordDiagnostics.push(
          error(
            "task_evidence_missing",
            location(record),
            record.id + " references missing evidence " + evidenceId + ".",
          ),
        );
      }
    }
    if (rawStatus !== undefined && status === null) {
      recordDiagnostics.push(
        error(
          "task_status_invalid",
          location(record),
          record.id + " status must be pending, in_progress, completed, or blocked.",
        ),
      );
    }
    if (status === "completed" && evidence.length === 0) {
      recordDiagnostics.push(
        error(
          "completed_task_evidence_missing",
          location(record),
          record.id + " is completed and must reference at least one EVID-* record.",
        ),
      );
    }

    diagnostics.push(...recordDiagnostics);
    facts.push({
      id: record.id,
      path: record.path,
      line: record.line,
      title: record.title,
      status,
      traceability,
      dependencies,
      evidence,
      valid: recordDiagnostics.length === 0,
    });
  }

  for (const cycle of findDependencyCycles(facts)) {
    diagnostics.push(
      error(
        "task_dependency_cycle",
        cycle.join(" -> "),
        "Task dependencies must be acyclic: " + cycle.join(" -> ") + ".",
      ),
    );
  }

  if (taskRecords.length === 0) {
    gateDiagnostics.push(
      error("task_record_missing", "delivery/README.md", "At least one TASK-* record is required."),
    );
  }

  const uncovered = (kind: MarkdownRecordFact["kind"]): string[] =>
    index.records
      .filter((record) => record.kind === kind)
      .filter((record) => !facts.some((task) => task.traceability.includes(record.id)))
      .map((record) => record.id)
      .sort();
  const uncoveredRequirements = uncovered("requirement");
  const uncoveredDesign = uncovered("design");
  const uncoveredAcceptance = uncovered("acceptance");
  for (const id of [...uncoveredRequirements, ...uncoveredDesign, ...uncoveredAcceptance]) {
    gateDiagnostics.push(
      error(
        "artifact_uncovered_by_task",
        id,
        id + " must be referenced by at least one TASK-* record.",
      ),
    );
  }

  const ready =
    taskRecords.length > 0 &&
    diagnostics.length === 0 &&
    uncoveredRequirements.length === 0 &&
    uncoveredDesign.length === 0 &&
    uncoveredAcceptance.length === 0;

  return {
    facts: {
      records: facts,
      ready,
      all_completed: ready && facts.every((task) => task.status === "completed"),
      uncovered_requirements: uncoveredRequirements,
      uncovered_design: uncoveredDesign,
      uncovered_acceptance: uncoveredAcceptance,
    },
    diagnostics,
    gateDiagnostics,
  };
}
