import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test } from "vite-plus/test";
import { parse, stringify } from "yaml";

import type { ArtifactDigest, ChangeState } from "../../src/core/runtime/state/types.js";

const cliPath = resolve("dist/bin/pm.js");

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

async function replaceText(path: string, before: string, after: string): Promise<void> {
  const content = await readFile(path, "utf8");
  assert.equal(content.includes(before), true, "fixture text was not found in " + path);
  await writeFile(path, content.replace(before, after), "utf8");
}

async function readState(changeRoot: string): Promise<ChangeState> {
  return parse(await readFile(join(changeRoot, "change.yaml"), "utf8")) as ChangeState;
}

async function writeState(changeRoot: string, state: ChangeState): Promise<void> {
  await writeFile(join(changeRoot, "change.yaml"), stringify(state, { lineWidth: 0 }), "utf8");
}

function confirmArgs(gate: string, changeId: string, projectRoot: string) {
  return [
    "confirm",
    gate,
    changeId,
    "--confirmed-by",
    gate === "design" ? "ai_project_manager" : "user",
    "--summary",
    "Reviewed " + gate + " baseline.",
    "--evidence",
    "Explicit confirmation evidence.",
    "--project",
    projectRoot,
    "--json",
  ];
}

async function prepareImplementation(projectRoot: string, changeRoot: string, changeId: string) {
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 需求记录\n\n使用 `### REQ-001: 标题` 记录稳定需求标识；正文可自由组织。",
    "## 需求记录\n\n### REQ-001: 支持工作流回退\n\n- 说明：状态必须可以确定性失效。",
  );
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 验收标准\n\n使用 `### AC-001: 标题`，并通过 `- 追溯：REQ-001` 引用需求。",
    "## 验收标准\n\n### AC-001: 回退结果可验证\n\n- 追溯：REQ-001\n- 断言：状态门按影响范围失效。",
  );
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 需求门前自检\n\n待执行。",
    "## 需求门前自检\n\n目标、范围、非范围、验收标准、冲突和遗漏均已检查。",
  );
  assert.equal(runCli(confirmArgs("requirements", changeId, projectRoot)).status, 0);

  const designPath = join(changeRoot, "design", "README.md");
  await replaceText(
    designPath,
    "- 架构与模块职责：待评估\n- 接口与协议：待评估\n- 数据：待评估\n- 交互：待评估\n- 安全：待评估\n- 运行：待评估\n- 决策记录：待评估",
    "- 架构与模块职责：涉及：状态失效由治理模块负责\n- 接口与协议：涉及：提供 invalidate CLI\n- 数据：不适用：不引入业务数据\n- 交互：不适用：没有界面变化\n- 安全：不适用：没有信任边界变化\n- 运行：不适用：没有部署变化\n- 决策记录：不适用：没有新增长期决定",
  );
  await replaceText(
    designPath,
    "## 设计记录\n\n使用 `### DES-001: 标题`，并通过 `- 追溯：REQ-001, AC-001` 建立基本覆盖。",
    "## 设计记录\n\n### DES-001: 按阶段失效\n\n- 追溯：REQ-001, AC-001\n- 决定：保留上游有效状态并清理下游派生状态。",
  );
  await replaceText(
    designPath,
    "## 权限分类\n\n- 确认责任：待分类\n- 理由：待记录。",
    "## 权限分类\n\n- 确认责任：ai_project_manager\n- 理由：只涉及局部、可逆实现选择。",
  );
  await replaceText(
    designPath,
    "## 设计门前自检\n\n待执行。",
    "## 设计门前自检\n\n需求覆盖、设计类型、风险、替代方案和权限分类均已检查。",
  );
  await replaceText(
    join(changeRoot, "delivery", "README.md"),
    "## 任务与依赖\n\n使用 `### TASK-001: 标题`。每项固定包含：目标、追溯、Consumes、Produces、预计修改范围、依赖任务、验证方法、预期结果、状态和证据。无依赖或暂无证据时明确写 `无`。",
    "## 任务与依赖\n\n### TASK-001: 实现状态回退\n\n- 目标：实现确定性失效\n- 追溯：REQ-001, DES-001, AC-001\n- Consumes：确认后的需求和设计\n- Produces：invalidate 操作\n- 预计修改范围：src/core/runtime\n- 依赖任务：无\n- 验证方法：运行回退门测试\n- 预期结果：保留正确的上游状态\n- 状态：pending\n- 证据：无",
  );

  const status = runCli(["status", changeId, "--project", projectRoot, "--json"]);
  assert.equal(status.status, 0, status.stderr);
  const value = JSON.parse(status.stdout) as {
    materials: Record<string, { artifacts: ArtifactDigest[] }>;
  };
  const state = await readState(changeRoot);
  state.readiness = {
    status: "pass",
    assessed_artifacts: ["requirements", "design", "delivery"]
      .flatMap((name) => value.materials[name]?.artifacts ?? [])
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
    concerns: [],
    assessed_at: "2026-07-15T04:00:00.000Z",
  };
  await writeState(changeRoot, state);
  const confirmed = runCli(confirmArgs("design", changeId, projectRoot));
  assert.equal(confirmed.status, 0, confirmed.stderr);
}

test("pm invalidate design preserves requirements and supports append-only reconfirmation", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-invalidate-design-"));
  const changeId = "design-rollback";
  const changeRoot = join(projectRoot, "changes", "active", changeId);

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "invalidate-design"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);
    await prepareImplementation(projectRoot, changeRoot, changeId);

    const result = runCli([
      "invalidate",
      "design",
      changeId,
      "--reason",
      "The selected session design is no longer feasible.",
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).nextAction, "revise_design");

    const rolledBack = await readState(changeRoot);
    assert.equal(rolledBack.phase, "design");
    assert.equal(rolledBack.gates.requirements.status, "confirmed");
    assert.equal(rolledBack.gates.design.status, "invalidated");
    assert.equal(rolledBack.gates.design.confirmations.length, 1);
    assert.equal(rolledBack.readiness.status, "stale");
    assert.equal(rolledBack.implementation.status, "not_started");
    assert.equal(rolledBack.history.at(-1)?.event, "design_invalidated");

    const status = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(status.status, 0, status.stderr);
    const statusValue = JSON.parse(status.stdout);
    assert.equal(statusValue.gates.requirements.valid, true);
    assert.equal(statusValue.gates.design.valid, false);
    assert.equal(
      statusValue.available_actions.some((action: { id: string }) => action.id === "revise_design"),
      true,
    );

    const current = await readState(changeRoot);
    const materialValue = statusValue as {
      materials: Record<string, { artifacts: ArtifactDigest[] }>;
    };
    current.readiness = {
      status: "pass",
      assessed_artifacts: ["requirements", "design", "delivery"]
        .flatMap((name) => materialValue.materials[name]?.artifacts ?? [])
        .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
      concerns: [],
      assessed_at: "2026-07-15T05:00:00.000Z",
    };
    await writeState(changeRoot, current);
    const reconfirmed = runCli(confirmArgs("design", changeId, projectRoot));
    assert.equal(reconfirmed.status, 0, reconfirmed.stderr);
    assert.equal(JSON.parse(reconfirmed.stdout).revision, 2);
    assert.deepEqual(
      (await readState(changeRoot)).gates.design.confirmations.map((item) => item.revision),
      [1, 2],
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("pm invalidate implementation keeps upstream gates and existing delivery files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-invalidate-implementation-"));
  const changeId = "implementation-rollback";
  const changeRoot = join(projectRoot, "changes", "active", changeId);

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "invalidate-implementation"])
        .status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);
    await prepareImplementation(projectRoot, changeRoot, changeId);
    const deliveryBefore = await readFile(join(changeRoot, "delivery", "README.md"), "utf8");
    const state = await readState(changeRoot);
    state.implementation.status = "in_progress";
    state.implementation.baseline_revision = "baseline-revision";
    state.next_action = {
      owner: "ai_project_manager",
      action: "continue_implementation",
      inputs: ["delivery/README.md"],
    };
    await writeState(changeRoot, state);

    const result = runCli([
      "invalidate",
      "implementation",
      changeId,
      "--reason",
      "A local implementation defect requires another implementation pass.",
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const next = await readState(changeRoot);
    assert.equal(next.gates.requirements.status, "confirmed");
    assert.equal(next.gates.design.status, "confirmed");
    assert.equal(next.implementation.status, "in_progress");
    assert.equal(next.implementation.baseline_revision, "baseline-revision");
    assert.equal(next.next_action.action, "continue_implementation");
    assert.equal(await readFile(join(changeRoot, "delivery", "README.md"), "utf8"), deliveryBefore);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("pm invalidate rejects missing metadata, unknown stages, and no-op rollback", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-invalidate-errors-"));
  const changeId = "rollback-errors";

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "invalidate-errors"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);

    const missingReason = runCli([
      "invalidate",
      "requirements",
      changeId,
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(missingReason.status, 2);
    assert.equal(JSON.parse(missingReason.stderr).error.code, "invalid_arguments");

    const unknown = runCli([
      "invalidate",
      "unknown",
      changeId,
      "--reason",
      "Fixture.",
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(unknown.status, 2);

    const noOp = runCli([
      "invalidate",
      "requirements",
      changeId,
      "--reason",
      "Nothing has been confirmed yet.",
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(noOp.status, 4);
    assert.equal(JSON.parse(noOp.stderr).error.code, "invalidation_blocked");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
