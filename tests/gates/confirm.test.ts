import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test } from "vite-plus/test";
import { parse, stringify } from "yaml";

import type { ArtifactDigest, ChangeState } from "../../src/core/runtime/state/types.js";

const cliPath = resolve("dist/bin/pm.js");

function runCli(args: readonly string[], cwd = process.cwd()) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

async function createProject(prefix: string, changeId: string) {
  const projectRoot = await mkdtemp(join(tmpdir(), prefix));
  const projectId = prefix.replaceAll(/[^a-z0-9-]/g, "").replaceAll(/^-+|-+$/g, "");
  assert.equal(runCli(["init", "--project", projectRoot, "--project-id", projectId]).status, 0);
  assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);

  return {
    projectRoot,
    changeRoot: join(projectRoot, "changes", "active", changeId),
  };
}

async function replaceText(path: string, before: string, after: string): Promise<void> {
  const content = await readFile(path, "utf8");
  assert.equal(content.includes(before), true, "fixture text was not found in " + path);
  await writeFile(path, content.replace(before, after), "utf8");
}

async function readChange(changeRoot: string): Promise<ChangeState> {
  return parse(await readFile(join(changeRoot, "change.yaml"), "utf8")) as ChangeState;
}

async function writeChange(changeRoot: string, state: ChangeState): Promise<void> {
  await writeFile(join(changeRoot, "change.yaml"), stringify(state, { lineWidth: 0 }), "utf8");
}

function confirmationArgs(
  gate: string,
  changeId: string,
  projectRoot: string,
  actor: "user" | "ai_project_manager",
) {
  return [
    "confirm",
    gate,
    changeId,
    "--confirmed-by",
    actor,
    "--summary",
    "Reviewed " + gate + " baseline.",
    "--evidence",
    "Explicit confirmation recorded by the AI project manager.",
    "--project",
    projectRoot,
    "--json",
  ];
}

async function completeRequirementsSelfCheck(changeRoot: string): Promise<void> {
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 需求记录\n\n使用 `### REQ-001: 标题` 记录稳定需求标识；正文可自由组织。",
    "## 需求记录\n\n### REQ-001: 提供确定性工作流\n\n- 说明：当前 Change 必须能够通过文件恢复。",
  );
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 验收标准\n\n使用 `### AC-001: 标题`，并通过 `- 追溯：REQ-001` 引用需求。",
    "## 验收标准\n\n### AC-001: 状态可验证\n\n- 追溯：REQ-001\n- 断言：CLI 能验证当前状态。",
  );
  await replaceText(
    join(changeRoot, "requirements.md"),
    "## 需求门前自检\n\n待执行。",
    "## 需求门前自检\n\n目标、范围、非范围、验收标准、冲突和遗漏均已检查。",
  );
}

async function completeDesignSections(changeRoot: string, responsibility: string): Promise<void> {
  const designPath = join(changeRoot, "design", "README.md");
  await replaceText(
    designPath,
    "- 架构与模块职责：待评估\n- 接口与协议：待评估\n- 数据：待评估\n- 交互：待评估\n- 安全：待评估\n- 运行：待评估\n- 决策记录：待评估",
    "- 架构与模块职责：涉及：按固定模块解析状态\n- 接口与协议：涉及：保持 CLI 输出契约\n- 数据：不适用：不引入业务数据存储\n- 交互：不适用：不改变用户界面\n- 安全：不适用：不改变信任边界\n- 运行：不适用：不改变部署方式\n- 决策记录：不适用：没有新增长期技术决定",
  );
  await replaceText(
    designPath,
    "## 设计记录\n\n使用 `### DES-001: 标题`，并通过 `- 追溯：REQ-001, AC-001` 建立基本覆盖。",
    "## 设计记录\n\n### DES-001: 使用文件状态解析\n\n- 追溯：REQ-001, AC-001\n- 决定：通过 canonical resolver 生成派生状态。",
  );
  await replaceText(
    designPath,
    "## 权限分类\n\n- 确认责任：待分类\n- 理由：待记录。",
    "## 权限分类\n\n- 确认责任：" + responsibility + "\n- 理由：已记录设计权限分类。",
  );
  await replaceText(
    designPath,
    "## 设计门前自检\n\n待执行。",
    "## 设计门前自检\n\n需求覆盖、设计类型、风险、替代方案和权限分类均已检查。",
  );
  await replaceText(
    join(changeRoot, "delivery", "README.md"),
    "## 任务与依赖\n\n使用 `### TASK-001: 标题`。每项固定包含：目标、追溯、Consumes、Produces、预计修改范围、依赖任务、验证方法、预期结果、状态和证据。无依赖或暂无证据时明确写 `无`。",
    "## 任务与依赖\n\n### TASK-001: 实现状态解析\n\n- 目标：实现确定性状态解析\n- 追溯：REQ-001, DES-001, AC-001\n- Consumes：确认后的需求和设计\n- Produces：可执行 CLI\n- 预计修改范围：src/core/runtime\n- 依赖任务：无\n- 验证方法：运行 CLI 集成测试\n- 预期结果：状态输出符合契约\n- 状态：pending\n- 证据：无",
  );
}

function readinessArtifacts(statusValue: {
  materials: Record<string, { artifacts: ArtifactDigest[] }>;
}): ArtifactDigest[] {
  return ["requirements", "design", "delivery"]
    .flatMap((name) => statusValue.materials[name]?.artifacts ?? [])
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

async function recordReadiness(
  projectRoot: string,
  changeRoot: string,
  changeId: string,
  input:
    | { status: "pass" }
    | { status: "concerns"; resolution: string | null; touchesUser: boolean },
): Promise<void> {
  const status = runCli(["status", changeId, "--project", projectRoot, "--json"]);
  assert.equal(status.status, 0, status.stderr);
  const statusValue = JSON.parse(status.stdout) as {
    materials: Record<string, { artifacts: ArtifactDigest[] }>;
  };
  const state = await readChange(changeRoot);
  state.readiness = {
    status: input.status,
    assessed_artifacts: readinessArtifacts(statusValue),
    concerns:
      input.status === "pass"
        ? []
        : [
            {
              id: "design-authority",
              impact: "The design changes a user-visible or security boundary.",
              owner: "user",
              resolution: input.resolution,
              touches_user_confirmation: input.touchesUser,
            },
          ],
    assessed_at: "2026-07-14T12:00:00.000Z",
  };
  await writeChange(changeRoot, state);
}

async function confirmRequirements(
  projectRoot: string,
  changeRoot: string,
  changeId: string,
): Promise<void> {
  await completeRequirementsSelfCheck(changeRoot);
  const confirmed = runCli(confirmationArgs("requirements", changeId, projectRoot, "user"));
  assert.equal(confirmed.status, 0, confirmed.stderr);
}

test("requirements confirmation requires self-check, explicit user metadata, and fresh digests", async () => {
  const changeId = "requirements-gate";
  const { projectRoot, changeRoot } = await createProject("pm-gate-requirements-", changeId);

  try {
    const missingEvidence = runCli([
      "confirm",
      "requirements",
      changeId,
      "--confirmed-by",
      "user",
      "--summary",
      "Reviewed baseline.",
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(missingEvidence.status, 2);
    assert.equal(JSON.parse(missingEvidence.stderr).error.code, "invalid_arguments");

    const beforeSelfCheck = runCli(confirmationArgs("requirements", changeId, projectRoot, "user"));
    assert.equal(beforeSelfCheck.status, 4);
    assert.equal(JSON.parse(beforeSelfCheck.stderr).error.code, "confirmation_blocked");
    assert.match(beforeSelfCheck.stderr, /requirements_self_check_not_recorded/);

    await completeRequirementsSelfCheck(changeRoot);
    const wrongActor = runCli(
      confirmationArgs("requirements", changeId, projectRoot, "ai_project_manager"),
    );
    assert.equal(wrongActor.status, 4);
    assert.equal(JSON.parse(wrongActor.stderr).error.code, "confirmation_authority_blocked");

    const first = runCli(confirmationArgs("requirements", changeId, projectRoot, "user"));
    assert.equal(first.status, 0, first.stderr);
    const firstResult = JSON.parse(first.stdout);
    assert.equal(firstResult.revision, 1);
    assert.equal(firstResult.phase, "design");

    const firstState = await readChange(changeRoot);
    assert.equal(firstState.gates.requirements.confirmations.length, 1);
    const firstConfirmation = firstState.gates.requirements.confirmations[0];
    assert.notEqual(firstConfirmation, undefined);
    assert.equal((firstConfirmation?.evidence.length ?? 0) > 0, true);

    const requirementsPath = join(changeRoot, "requirements.md");
    await writeFile(
      requirementsPath,
      (await readFile(requirementsPath, "utf8")) + "\n补充一个会改变摘要的约束。\n",
      "utf8",
    );
    const stale = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(stale.status, 3);
    const staleValue = JSON.parse(stale.stdout);
    assert.equal(staleValue.gates.requirements.status, "invalidated");
    assert.equal(staleValue.gates.requirements.invalid_reason, "material_set_changed");
    assert.equal(
      staleValue.diagnostics.some((item: { code: string }) => item.code === "confirmation_stale"),
      true,
    );

    const second = runCli(confirmationArgs("requirements", changeId, projectRoot, "user"));
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).revision, 2);
    const secondState = await readChange(changeRoot);
    assert.deepEqual(
      secondState.gates.requirements.confirmations.map((confirmation) => confirmation.revision),
      [1, 2],
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("design confirmation requires fresh readiness and routes user-owned concerns to the user", async () => {
  const changeId = "design-gate";
  const { projectRoot, changeRoot } = await createProject("pm-gate-design-", changeId);

  try {
    await confirmRequirements(projectRoot, changeRoot, changeId);
    await completeDesignSections(changeRoot, "user");

    const beforeReadiness = runCli(confirmationArgs("design", changeId, projectRoot, "user"));
    assert.equal(beforeReadiness.status, 4);
    assert.match(beforeReadiness.stderr, /readiness_not_assessed/);

    await recordReadiness(projectRoot, changeRoot, changeId, {
      status: "concerns",
      resolution: null,
      touchesUser: true,
    });
    const unresolved = runCli(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(unresolved.status, 3);
    assert.match(unresolved.stdout, /readiness_concern_unresolved/);
    const unresolvedConfirm = runCli(confirmationArgs("design", changeId, projectRoot, "user"));
    assert.equal(unresolvedConfirm.status, 4);
    assert.match(unresolvedConfirm.stderr, /readiness_concerns/);

    const unresolvedState = await readChange(changeRoot);
    const concern = unresolvedState.readiness.concerns[0];
    assert.notEqual(concern, undefined);
    if (concern !== undefined) {
      concern.resolution = "The user must confirm this design boundary.";
    }
    await writeChange(changeRoot, unresolvedState);

    const ready = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(ready.status, 0, ready.stderr);
    const readyValue = JSON.parse(ready.stdout);
    assert.equal(readyValue.readiness.ready, true);
    assert.equal(
      readyValue.available_actions.find((action: { id: string }) => action.id === "confirm_design")
        ?.owner,
      "user",
    );

    const wrongActor = runCli(
      confirmationArgs("design", changeId, projectRoot, "ai_project_manager"),
    );
    assert.equal(wrongActor.status, 4);
    assert.match(wrongActor.stderr, /design_requires_user_confirmation/);

    const confirmed = runCli(confirmationArgs("design", changeId, projectRoot, "user"));
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.equal(JSON.parse(confirmed.stdout).phase, "implementation");

    const implementation = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(implementation.status, 0, implementation.stderr);
    assert.equal(
      JSON.parse(implementation.stdout).available_actions.some(
        (action: { id: string }) => action.id === "start_implementation",
      ),
      true,
    );

    const designPath = join(changeRoot, "design", "README.md");
    await writeFile(
      designPath,
      (await readFile(designPath, "utf8")) + "\n设计摘要发生变化。\n",
      "utf8",
    );
    const stale = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(stale.status, 3);
    const staleValue = JSON.parse(stale.stdout);
    assert.equal(staleValue.gates.design.status, "invalidated");
    assert.equal(staleValue.readiness.status, "stale");
    assert.equal(staleValue.readiness.ready, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("AI project manager may confirm a local reversible design after a fresh pass", async () => {
  const changeId = "local-design";
  const { projectRoot, changeRoot } = await createProject("pm-gate-local-design-", changeId);

  try {
    await confirmRequirements(projectRoot, changeRoot, changeId);
    await completeDesignSections(changeRoot, "ai_project_manager");
    await recordReadiness(projectRoot, changeRoot, changeId, { status: "pass" });

    const confirmed = runCli(
      confirmationArgs("design", changeId, projectRoot, "ai_project_manager"),
    );
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.equal(JSON.parse(confirmed.stdout).confirmedBy, "ai_project_manager");
    const state = await readChange(changeRoot);
    assert.equal(state.gates.design.confirmations[0]?.confirmed_by, "ai_project_manager");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
