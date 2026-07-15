import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test } from "vite-plus/test";
import { parse, stringify } from "yaml";

import { digestFile } from "../../src/core/runtime/materials/digest.js";
import type { ArtifactDigest, ChangeState } from "../../src/core/runtime/state/types.js";

const cliPath = resolve("dist/bin/pm.js");

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

async function readState(changeRoot: string): Promise<ChangeState> {
  return parse(await readFile(join(changeRoot, "change.yaml"), "utf8")) as ChangeState;
}

async function writeState(changeRoot: string, state: ChangeState): Promise<void> {
  await writeFile(join(changeRoot, "change.yaml"), stringify(state, { lineWidth: 0 }), "utf8");
}

function confirmationArgs(gate: string, changeId: string, projectRoot: string): string[] {
  return [
    "confirm",
    gate,
    changeId,
    "--confirmed-by",
    gate === "design" ? "ai_project_manager" : "user",
    "--summary",
    "Verified contract fixture.",
    "--evidence",
    "Explicit fixture confirmation.",
    "--project",
    projectRoot,
    "--json",
  ];
}

function requirementsDocument(): string {
  return [
    "# Verification gate requirements",
    "",
    "## 需求记录",
    "",
    "### REQ-001: Verify the complete Change",
    "",
    "- 说明：Acceptance requires more than a passing test.",
    "",
    "## 验收标准",
    "",
    "### AC-001: Four dimensions are current",
    "",
    "- 追溯：REQ-001",
    "- 断言：All four dimensions bind current evidence.",
    "",
    "## 需求门前自检",
    "",
    "目标、范围、非范围、验收标准、冲突和遗漏均已检查。",
    "",
  ].join("\n");
}

function designDocument(): string {
  return [
    "# Verification gate design",
    "",
    "## 设计范围覆盖",
    "",
    "- 架构与模块职责：涉及：verification resolver owns deterministic checks",
    "- 接口与协议：涉及：status exposes acceptance readiness",
    "- 数据：不适用：no business data changes",
    "- 交互：不适用：no UI changes",
    "- 安全：不适用：no trust boundary changes",
    "- 运行：不适用：no deployment changes",
    "- 决策记录：不适用：no new long-term decision",
    "",
    "## 设计记录",
    "",
    "### DES-001: Derive acceptance readiness",
    "",
    "- 追溯：REQ-001, AC-001",
    "- 决定：Require four current dimensions.",
    "",
    "## 权限分类",
    "",
    "- 确认责任：ai_project_manager",
    "- 理由：局部、可逆的测试夹具设计。",
    "",
    "## 材料清单",
    "",
    "- `design/README.md`",
    "",
    "## 设计门前自检",
    "",
    "需求覆盖、设计类型、风险、替代方案和权限分类均已检查。",
    "",
  ].join("\n");
}

function taskAndEvidenceDocument(input: {
  baseline: string;
  final: string;
  checkpoint: string;
  executedAt: string;
  completeDimensions: boolean;
}): string {
  const dimensions = input.completeDimensions
    ? [
        "- Completeness：EVID-001",
        "- Correctness：EVID-002",
        "- Coherence：EVID-003",
        "- Engineering quality：EVID-004",
      ]
    : ["- Correctness：EVID-002", "- Engineering quality：EVID-004"];
  const evidence = [
    ["EVID-001", "Completeness", "All requirements, tasks, and criteria are covered"],
    ["EVID-002", "Correctness", "The expected CLI behavior was observed"],
    ["EVID-003", "Coherence", "The implementation follows DES-001"],
    ["EVID-004", "Engineering quality", "Static checks and tests passed"],
  ];

  return [
    "# Verification gate delivery",
    "",
    "## 任务与依赖",
    "",
    "### TASK-001: Implement verification gate",
    "",
    "- 目标：Derive acceptance readiness",
    "- 追溯：REQ-001, DES-001, AC-001",
    "- Consumes：Confirmed requirements and design",
    "- Produces：Verification facts and actions",
    "- 预计修改范围：src/core/runtime/governance",
    "- 依赖任务：无",
    "- 验证方法：Run the gate fixture",
    "- 预期结果：Only complete four-dimensional evidence is ready",
    "- 状态：completed",
    "- 证据：EVID-001, EVID-002, EVID-003, EVID-004",
    "",
    "## 验证与证据",
    "",
    ...dimensions,
    "",
    ...evidence.flatMap(([id, dimension, assertion]) => [
      "### " + id + ": " + dimension + " evidence",
      "",
      "- 维度：" + dimension,
      "- 追溯：REQ-001, DES-001, AC-001, TASK-001",
      "- 命令或操作：pnpm run verify",
      "- 工作目录或环境：workspace / Node.js",
      "- 执行时间：" + input.executedAt,
      "- 退出码或结果：0",
      "- 关键输出：Verification fixture passed",
      "- 断言：" + assertion,
      "- 基线 revision：" + input.baseline,
      "- 最终 revision：" + input.final,
      "- checkpoint digest：" + input.checkpoint,
      "",
    ]),
    "## 材料清单",
    "",
    "- `delivery/README.md`",
    "",
    "## 验收门前自检",
    "",
    "交付范围、四维证据、限制和用户验收步骤均已检查。",
    "",
  ].join("\n");
}

test("acceptance preparation requires complete, current four-dimensional evidence", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-verification-gate-"));
  const changeId = "verification-gate";
  const changeRoot = join(projectRoot, "changes", "active", changeId);
  const engineeringPath = join(projectRoot, "engineering", "fixture.ts");

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "verification-gate"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);
    await writeFile(join(changeRoot, "requirements.md"), requirementsDocument());
    await writeFile(join(changeRoot, "design", "README.md"), designDocument());
    await writeFile(
      join(changeRoot, "delivery", "README.md"),
      taskAndEvidenceDocument({
        baseline: "pending",
        final: "pending",
        checkpoint: "pending",
        executedAt: "2026-07-15T00:00:00.000Z",
        completeDimensions: false,
      })
        .replace("- 状态：completed", "- 状态：pending")
        .replace("- 证据：EVID-001, EVID-002, EVID-003, EVID-004", "- 证据：无")
        .replace(/^### EVID-[\s\S]*?(?=^## 材料清单)/mu, ""),
    );

    const preConfirmation = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    const requirementsConfirmation = runCli(
      confirmationArgs("requirements", changeId, projectRoot),
    );
    assert.equal(
      requirementsConfirmation.status,
      0,
      preConfirmation.stdout + preConfirmation.stderr + requirementsConfirmation.stderr,
    );

    const beforeReadiness = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(beforeReadiness.status, 0, beforeReadiness.stderr);
    const beforeReadinessValue = JSON.parse(beforeReadiness.stdout) as {
      materials: Record<string, { artifacts: ArtifactDigest[] }>;
    };
    const state = await readState(changeRoot);
    state.readiness = {
      status: "pass",
      assessed_artifacts: ["requirements", "design", "delivery"]
        .flatMap((name) => beforeReadinessValue.materials[name]?.artifacts ?? [])
        .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
      concerns: [],
      assessed_at: new Date(Date.parse(state.base.captured_at) + 1_000).toISOString(),
    };
    await writeState(changeRoot, state);

    const designConfirmation = runCli(confirmationArgs("design", changeId, projectRoot));
    assert.equal(designConfirmation.status, 0, designConfirmation.stderr);

    await mkdir(join(projectRoot, "engineering"), { recursive: true });
    await writeFile(engineeringPath, "export const verified = true;\n");
    const implementationState = await readState(changeRoot);
    implementationState.base.dependencies.engineering = [
      {
        path: "engineering/fixture.ts",
        digest: await digestFile(engineeringPath),
        purpose: "Verification gate implementation scope.",
      },
    ];
    await writeState(changeRoot, implementationState);
    const scopeStatus = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(scopeStatus.status, 0, scopeStatus.stderr);
    const checkpoint = JSON.parse(scopeStatus.stdout).recovery.checkpoint.current_scope_digest;
    assert.equal(typeof checkpoint, "string");

    const baseline = "baseline-revision";
    const final = "final-revision";
    const checkpointAt = new Date(Date.parse(implementationState.base.captured_at) + 2_000);
    const executedAt = new Date(checkpointAt.getTime() + 1_000).toISOString();
    await writeFile(
      join(changeRoot, "delivery", "README.md"),
      taskAndEvidenceDocument({
        baseline,
        final,
        checkpoint,
        executedAt,
        completeDimensions: false,
      }),
    );
    const incompleteState = await readState(changeRoot);
    incompleteState.implementation = {
      status: "verified",
      baseline_revision: baseline,
      final_revision: final,
      checkpoint: {
        scope_digest: checkpoint,
        captured_at: checkpointAt.toISOString(),
      },
    };
    incompleteState.next_action = {
      owner: "ai_project_manager",
      action: "invalidate_implementation",
      inputs: ["change.yaml"],
    };
    await writeState(changeRoot, incompleteState);

    const incomplete = runCli(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(incomplete.status, 3);
    const incompleteValue = JSON.parse(incomplete.stdout).state;
    assert.equal(
      incompleteValue.diagnostics.filter(
        (item: { code: string }) => item.code === "verification_dimension_missing",
      ).length,
      2,
    );
    assert.equal(
      incompleteValue.blocked_actions.some(
        (action: { id: string; reason: string }) =>
          action.id === "prepare_acceptance" && action.reason === "verification_not_ready",
      ),
      true,
    );

    await writeFile(
      join(changeRoot, "delivery", "README.md"),
      taskAndEvidenceDocument({
        baseline,
        final,
        checkpoint,
        executedAt,
        completeDimensions: true,
      }),
    );
    const completeState = await readState(changeRoot);
    completeState.next_action = {
      owner: "ai_project_manager",
      action: "prepare_acceptance",
      inputs: ["delivery/README.md"],
    };
    await writeState(changeRoot, completeState);

    const complete = runCli(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(complete.status, 0, complete.stdout + complete.stderr);
    const completeValue = JSON.parse(complete.stdout).state;
    assert.equal(completeValue.verification.ready_for_acceptance, true);
    assert.equal(
      completeValue.available_actions.some(
        (action: { id: string }) => action.id === "prepare_acceptance",
      ),
      true,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
