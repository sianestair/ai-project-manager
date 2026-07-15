import assert from "node:assert/strict";

import { test } from "vite-plus/test";

import { resolveVerification } from "../../src/core/runtime/governance/verification.js";
import { createInitialChangeState } from "../../src/core/runtime/project/templates.js";
import type {
  ArtifactIndex,
  ArtifactRecordKind,
  MarkdownRecordFact,
  TaskContractFacts,
} from "../../src/core/runtime/state/types.js";

function record(
  id: string,
  kind: ArtifactRecordKind,
  references: string[] = [],
  fields: Record<string, string> = {},
): MarkdownRecordFact {
  return { id, kind, title: id, path: "delivery/README.md", line: 1, fields, references };
}

const tasks: TaskContractFacts = {
  records: [],
  ready: true,
  all_completed: true,
  uncovered_requirements: [],
  uncovered_design: [],
  uncovered_acceptance: [],
};

test("verification requires all four dimensions and current revision-bound evidence", () => {
  const state = createInitialChangeState({
    changeId: "verification",
    title: "Verification",
    capturedAt: "2026-07-15T00:00:00.000Z",
    projectRevision: "project",
  });
  state.implementation = {
    status: "verified",
    baseline_revision: "base",
    final_revision: "final",
    checkpoint: {
      scope_digest: "scope",
      captured_at: "2026-07-15T01:00:00.000Z",
    },
  };
  const evidenceFields = {
    维度: "Correctness",
    追溯: "REQ-001, AC-001, DES-001, TASK-001",
    命令或操作: "pnpm test",
    工作目录或环境: "workspace / Node.js",
    执行时间: "2026-07-15T02:00:00.000Z",
    退出码或结果: "0",
    关键输出: "tests passed",
    断言: "Observed behavior is correct",
    "基线 revision": "base",
    "最终 revision": "stale-final",
    "checkpoint digest": "scope",
  };
  const index: ArtifactIndex = {
    records: [
      record("REQ-001", "requirement"),
      record("AC-001", "acceptance", ["REQ-001"]),
      record("DES-001", "design", ["REQ-001"]),
      record("TASK-001", "task"),
      record("EVID-001", "evidence", [], evidenceFields),
    ],
    design_coverage: [],
    verification_dimensions: [
      {
        name: "correctness",
        value: "EVID-001",
        path: "delivery/README.md",
        line: 2,
      },
      {
        name: "engineering_quality",
        value: "不适用：fixture has no engineering surface",
        path: "delivery/README.md",
        line: 3,
      },
    ],
  };

  const result = resolveVerification({ index, tasks, state });
  assert.equal(result.facts.ready_for_acceptance, false);
  assert.equal(
    result.diagnostics.some((item) => item.code === "evidence_revision_binding_invalid"),
    true,
  );
  assert.equal(
    result.gateDiagnostics.filter((item) => item.code === "verification_dimension_missing").length,
    2,
  );
});
