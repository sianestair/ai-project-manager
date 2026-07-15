import assert from "node:assert/strict";

import { test } from "vite-plus/test";

import { resolveTaskContracts } from "../../src/core/runtime/governance/tasks.js";
import { resolveTraceability } from "../../src/core/runtime/governance/traceability.js";
import type {
  ArtifactIndex,
  ArtifactRecordKind,
  MarkdownRecordFact,
} from "../../src/core/runtime/state/types.js";

function record(
  id: string,
  kind: ArtifactRecordKind,
  references: string[] = [],
  fields: Record<string, string> = {},
): MarkdownRecordFact {
  return { id, kind, title: id, path: "fixture.md", line: 1, fields, references };
}

function baseIndex(records: MarkdownRecordFact[]): ArtifactIndex {
  return {
    records,
    design_coverage: [
      "架构与模块职责",
      "接口与协议",
      "数据",
      "交互",
      "安全",
      "运行",
      "决策记录",
    ].map((name, index) => ({
      name,
      value: "不适用：fixture reason",
      path: "design/README.md",
      line: index + 1,
    })),
    verification_dimensions: [],
  };
}

test("traceability reports dangling references, uncovered requirements, and missing reasons", () => {
  const index = baseIndex([
    record("REQ-001", "requirement"),
    record("REQ-002", "requirement"),
    record("AC-001", "acceptance", ["REQ-001", "REQ-404"]),
    record("DES-001", "design", ["REQ-001", "AC-001"]),
  ]);
  index.design_coverage[0]!.value = "不适用";

  const result = resolveTraceability(index);
  assert.deepEqual(result.facts.dangling_references, ["REQ-404"]);
  assert.deepEqual(result.facts.uncovered_requirements_by_design, ["REQ-002"]);
  assert.equal(result.facts.design_ready, false);
  assert.equal(
    result.designGateDiagnostics.some((item) => item.code === "design_coverage_invalid"),
    true,
  );
});

test("task contracts reject missing fields, dependency cycles, and completed tasks without evidence", () => {
  const taskFields = (dependency: string): Record<string, string> => ({
    目标: "Implement fixture",
    追溯: "REQ-001, DES-001, AC-001",
    consumes: "Confirmed materials",
    produces: "Runtime behavior",
    预计修改范围: "src/core/runtime",
    依赖任务: dependency,
    验证方法: "Run tests",
    预期结果: "Tests pass",
    状态: "completed",
    证据: "无",
  });
  const index = baseIndex([
    record("REQ-001", "requirement"),
    record("AC-001", "acceptance", ["REQ-001"]),
    record("DES-001", "design", ["REQ-001", "AC-001"]),
    record("TASK-001", "task", [], taskFields("TASK-002")),
    record("TASK-002", "task", [], taskFields("TASK-001")),
  ]);
  delete index.records[3]!.fields.produces;

  const result = resolveTaskContracts(index);
  assert.equal(result.facts.ready, false);
  assert.equal(
    result.diagnostics.some((item) => item.code === "task_field_missing"),
    true,
  );
  assert.equal(
    result.diagnostics.some((item) => item.code === "task_dependency_cycle"),
    true,
  );
  assert.equal(
    result.diagnostics.some((item) => item.code === "completed_task_evidence_missing"),
    true,
  );
});
