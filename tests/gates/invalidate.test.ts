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
    "## 需求门前自检\n\n待执行。",
    "## 需求门前自检\n\n目标、范围、非范围、验收标准、冲突和遗漏均已检查。",
  );
  assert.equal(runCli(confirmArgs("requirements", changeId, projectRoot)).status, 0);

  const designPath = join(changeRoot, "design", "README.md");
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
