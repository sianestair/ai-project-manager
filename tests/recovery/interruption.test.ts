import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function runGit(projectRoot: string, args: readonly string[]) {
  return spawnSync("git", ["-C", projectRoot, ...args], {
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

async function prepareDesign(
  projectRoot: string,
  changeRoot: string,
  changeId: string,
): Promise<void> {
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 需求记录\n\n使用 `### REQ-001: 标题` 记录稳定需求标识；正文可自由组织。",
    "## 需求记录\n\n### REQ-001: 支持中断恢复\n\n- 说明：新进程必须恢复当前工作边界。",
  );
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 验收标准\n\n使用 `### AC-001: 标题`，并通过 `- 追溯：REQ-001` 引用需求。",
    "## 验收标准\n\n### AC-001: 恢复入口确定\n\n- 追溯：REQ-001\n- 断言：状态输出包含有效 next_action。",
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
    "- 架构与模块职责：涉及：恢复由 canonical resolver 推导\n- 接口与协议：涉及：状态输出包含恢复事实\n- 数据：不适用：不引入业务数据\n- 交互：不适用：没有界面变化\n- 安全：不适用：没有信任边界变化\n- 运行：涉及：新进程读取文件恢复\n- 决策记录：不适用：没有新增长期决定",
  );
  await replaceText(
    designPath,
    "## 设计记录\n\n使用 `### DES-001: 标题`，并通过 `- 追溯：REQ-001, AC-001` 建立基本覆盖。",
    "## 设计记录\n\n### DES-001: 从文件恢复状态\n\n- 追溯：REQ-001, AC-001\n- 决定：只使用项目文件和 Git 事实恢复。",
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
    "## 任务与依赖\n\n### TASK-001: 实现中断恢复\n\n- 目标：从持久状态恢复下一步\n- 追溯：REQ-001, DES-001, AC-001\n- Consumes：change.yaml 和工作区事实\n- Produces：恢复事实与 next_action\n- 预计修改范围：src/core/runtime\n- 依赖任务：无\n- 验证方法：启动新 CLI 进程\n- 预期结果：恢复确认边界和继续入口\n- 状态：pending\n- 证据：无",
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
    assessed_at: "2026-07-15T06:00:00.000Z",
  };
  await writeState(changeRoot, state);
}

async function createGitProject(prefix: string, projectId: string) {
  const projectRoot = await mkdtemp(join(tmpdir(), prefix));
  assert.equal(runGit(projectRoot, ["init", "-b", "main"]).status, 0);
  assert.equal(runGit(projectRoot, ["config", "user.email", "fixture@example.test"]).status, 0);
  assert.equal(runGit(projectRoot, ["config", "user.name", "Fixture User"]).status, 0);
  assert.equal(runCli(["init", "--project", projectRoot, "--project-id", projectId]).status, 0);
  const appPath = join(projectRoot, "engineering", "app.ts");
  await writeFile(appPath, "export const version = 1;\n", "utf8");
  assert.equal(runGit(projectRoot, ["add", "."]).status, 0);
  assert.equal(runGit(projectRoot, ["commit", "-m", "fixture baseline"]).status, 0);
  return { projectRoot, appPath };
}

test("a new process restores the design confirmation boundary from project files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-recovery-design-"));
  const changeId = "design-interruption";
  const changeRoot = join(projectRoot, "changes", "active", changeId);

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "recovery-design"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);
    await prepareDesign(projectRoot, changeRoot, changeId);

    const ready = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(ready.status, 0, ready.stderr);
    const readyValue = JSON.parse(ready.stdout);
    const confirmDesign = readyValue.available_actions.find(
      (action: { id: string }) => action.id === "confirm_design",
    );
    assert.notEqual(confirmDesign, undefined);
    const state = await readState(changeRoot);
    state.next_action = {
      owner: confirmDesign.owner,
      action: confirmDesign.action,
      inputs: confirmDesign.inputs,
    };
    await writeState(changeRoot, state);

    const restored = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(restored.status, 0, restored.stderr);
    const value = JSON.parse(restored.stdout);
    assert.equal(value.change.phase, "design");
    assert.deepEqual(value.recovery.confirmed_gates, ["requirements"]);
    assert.deepEqual(value.recovery.inputs, ["design/README.md"]);
    assert.equal(value.next_action.action, "confirm_design");
    assert.equal(value.next_action.valid, true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("registered dependency and checkpoint drift block continuation but unrelated changes do not", async () => {
  const { projectRoot, appPath } = await createGitProject(
    "pm-recovery-implementation-",
    "recovery-implementation",
  );
  const changeId = "implementation-interruption";
  const changeRoot = join(projectRoot, "changes", "active", changeId);

  try {
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);
    await prepareDesign(projectRoot, changeRoot, changeId);
    assert.equal(runCli(confirmArgs("design", changeId, projectRoot)).status, 0);

    const state = await readState(changeRoot);
    state.base.dependencies.engineering = [
      {
        path: "engineering/app.ts",
        digest: await digestFile(appPath),
        purpose: "Wallet login implementation scope.",
      },
    ];
    state.implementation.status = "in_progress";
    state.implementation.baseline_revision = runGit(projectRoot, [
      "rev-parse",
      "HEAD",
    ]).stdout.trim();
    state.next_action = {
      owner: "ai_project_manager",
      action: "continue_implementation",
      inputs: ["delivery/README.md"],
    };
    await writeState(changeRoot, state);

    const beforeCheckpoint = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(beforeCheckpoint.status, 0, beforeCheckpoint.stderr);
    const beforeValue = JSON.parse(beforeCheckpoint.stdout);
    assert.equal(beforeValue.recovery.requires_reassessment, false);
    assert.equal(beforeValue.recovery.checkpoint.current_scope_digest.length, 64);

    const checkpointed = await readState(changeRoot);
    checkpointed.implementation.checkpoint = {
      scope_digest: beforeValue.recovery.checkpoint.current_scope_digest,
      captured_at: "2026-07-15T07:00:00.000Z",
    };
    await writeState(changeRoot, checkpointed);

    const restored = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(restored.status, 0, restored.stderr);
    const restoredValue = JSON.parse(restored.stdout);
    assert.equal(restoredValue.recovery.checkpoint.status, "fresh");
    assert.equal(restoredValue.next_action.action, "continue_implementation");
    assert.equal(restoredValue.next_action.valid, true);

    await writeFile(appPath, "export const version = 2;\n", "utf8");
    const drifted = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(drifted.status, 3);
    const driftedValue = JSON.parse(drifted.stdout);
    assert.equal(driftedValue.recovery.requires_reassessment, true);
    assert.equal(driftedValue.recovery.dependency_drift[0].status, "changed");
    assert.equal(driftedValue.recovery.checkpoint.status, "stale");
    assert.equal(
      driftedValue.available_actions.some(
        (action: { id: string }) => action.id === "reassess_dependency_drift",
      ),
      true,
    );
    assert.equal(
      driftedValue.blocked_actions.some(
        (action: { id: string; reason: string }) =>
          action.id === "continue_implementation" &&
          action.reason === "dependency_drift_pending_reassessment",
      ),
      true,
    );

    const reassessed = await readState(changeRoot);
    reassessed.base.dependencies.engineering[0]!.digest =
      driftedValue.recovery.dependency_drift[0].current_digest;
    reassessed.implementation.checkpoint.scope_digest =
      driftedValue.recovery.checkpoint.current_scope_digest;
    reassessed.implementation.checkpoint.captured_at = "2026-07-15T08:00:00.000Z";
    await writeState(changeRoot, reassessed);
    await writeFile(
      join(projectRoot, "engineering", "unrelated.ts"),
      "export const unrelated = true;\n",
    );

    const unrelated = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(unrelated.status, 0, unrelated.stderr);
    const unrelatedValue = JSON.parse(unrelated.stdout);
    assert.equal(unrelatedValue.recovery.requires_reassessment, false);
    assert.equal(unrelatedValue.recovery.checkpoint.status, "fresh");
    assert.equal(
      unrelatedValue.recovery.workspace.changes.some(
        (change: { path: string; registered: boolean }) =>
          change.path === "engineering/unrelated.ts" && !change.registered,
      ),
      true,
    );
    assert.equal(
      unrelatedValue.available_actions.some(
        (action: { id: string }) => action.id === "continue_implementation",
      ),
      true,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("multiple active Changes require an explicit id after interruption", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-recovery-selection-"));

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "recovery-selection"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", "first-change", "--project", projectRoot]).status, 0);
    assert.equal(runCli(["change", "start", "second-change", "--project", projectRoot]).status, 0);

    const result = runCli(["status", "--project", projectRoot, "--json"]);
    assert.equal(result.status, 2);
    const error = JSON.parse(result.stderr).error;
    assert.equal(error.code, "change_selection_required");
    assert.deepEqual(error.details, ["first-change", "second-change"]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
