import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { test } from "vite-plus/test";
import { parse, stringify } from "yaml";

const cliPath = resolve("dist/bin/pm.js");

function runCli(args: readonly string[], cwd = process.cwd()) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

async function readChangeFiles(projectRoot: string, changeId: string) {
  const changeRoot = join(projectRoot, "changes", "active", changeId);
  const relativePaths = [
    "change.yaml",
    "requirements.md",
    "design/README.md",
    "delivery/README.md",
    "knowledge-update.md",
  ];
  const entries = await Promise.all(
    relativePaths.map(
      async (path) => [path, await readFile(join(changeRoot, ...path.split("/")), "utf8")] as const,
    ),
  );

  return Object.fromEntries(entries);
}

test("CAC command registry exposes stable help and version contracts", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /AI Project Manager CLI/);
  assert.match(help.stdout, /change start <id>/);
  assert.doesNotMatch(help.stdout, /<operation>/);

  const changeHelp = runCli(["change", "start", "--help"]);
  assert.equal(changeHelp.status, 0, changeHelp.stderr);
  assert.match(changeHelp.stdout, /pm change start <id>/);
  assert.match(changeHelp.stdout, /--title <title>/);

  const version = runCli(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), "0.1.0");
});

test("CAC argument failures preserve usage exit and JSON error contracts", () => {
  const missingId = runCli(["change", "start", "--json"]);
  assert.equal(missingId.status, 2);
  assert.equal(JSON.parse(missingId.stderr).error.code, "invalid_arguments");
  assert.match(missingId.stderr, /missing required args/);

  const unknownOption = runCli(["status", "--unknown", "--json"]);
  assert.equal(unknownOption.status, 2);
  assert.equal(JSON.parse(unknownOption.stderr).error.code, "invalid_arguments");
  assert.match(unknownOption.stderr, /Unknown option/);

  const unknownCommand = runCli(["unknown", "--json"]);
  assert.equal(unknownCommand.status, 2);
  assert.equal(JSON.parse(unknownCommand.stderr).error.code, "unknown_command");

  const wrongChangeOperation = runCli(["change", "stop", "change-id", "--json"]);
  assert.equal(wrongChangeOperation.status, 2);
  assert.equal(JSON.parse(wrongChangeOperation.stderr).error.code, "unknown_command");
  assert.match(wrongChangeOperation.stderr, /pm change start/);
});

test("minimal vertical slice works in separate CLI processes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-slice1-"));
  const changeId = "wallet-login";

  try {
    const init = runCli(["init", "--project", projectRoot, "--project-id", "slice-one", "--json"]);
    assert.equal(init.status, 0, init.stderr);
    assert.equal(JSON.parse(init.stdout).projectId, "slice-one");

    const secondInit = runCli(["init", "--project", projectRoot, "--project-id", "slice-one"]);
    assert.equal(secondInit.status, 0, secondInit.stderr);
    assert.match(secondInit.stdout, /Already initialized/);

    const start = runCli([
      "change",
      "start",
      changeId,
      "--title",
      "连接钱包登录",
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(start.status, 0, start.stderr);

    const beforeStatus = await readChangeFiles(projectRoot, changeId);
    const status = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(status.status, 0, status.stderr);
    const statusValue = JSON.parse(status.stdout);
    assert.equal(statusValue.change.phase, "requirements");
    assert.equal(statusValue.change.project_revision, null);
    assert.equal(statusValue.materials.requirements.digest.length, 64);
    assert.deepEqual(
      statusValue.available_actions.map((action: { id: string }) => action.id),
      ["draft_requirements", "revise_requirements"],
    );
    assert.equal(statusValue.next_action.valid, true);
    assert.deepEqual(await readChangeFiles(projectRoot, changeId), beforeStatus);

    const nestedStatus = runCli(
      ["status", changeId, "--json"],
      join(projectRoot, "changes", "active", changeId, "design"),
    );
    assert.equal(nestedStatus.status, 0, nestedStatus.stderr);
    assert.equal(nestedStatus.stdout, status.stdout);

    const validate = runCli(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(validate.status, 0, validate.stderr);
    assert.equal(JSON.parse(validate.stdout).valid, true);

    const duplicate = runCli(["change", "start", changeId, "--project", projectRoot]);
    assert.equal(duplicate.status, 5);
    assert.match(duplicate.stderr, /change_id_conflict/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("init refuses to overwrite pre-existing managed files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-init-conflict-"));

  try {
    const agentsPath = join(projectRoot, "AGENTS.md");
    await writeFile(agentsPath, "user-owned\n", "utf8");
    const result = runCli(["init", "--project", projectRoot, "--project-id", "conflict-fixture"]);

    assert.equal(result.status, 5);
    assert.match(result.stderr, /initialization_conflict/);
    assert.equal(await readFile(agentsPath, "utf8"), "user-owned\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("validate rejects missing required materials and unavailable next actions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-invalid-"));
  const changeId = "invalid-state";

  try {
    assert.equal(
      runCli(["init", "--project", projectRoot, "--project-id", "invalid-fixture"]).status,
      0,
    );
    assert.equal(runCli(["change", "start", changeId, "--project", projectRoot]).status, 0);

    const changeRoot = join(projectRoot, "changes", "active", changeId);
    const requirementsPath = join(changeRoot, "requirements.md");
    const requirements = await readFile(requirementsPath, "utf8");
    await rm(requirementsPath);

    const missing = runCli(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(missing.status, 3);
    assert.match(missing.stdout, /material_unavailable/);

    await writeFile(requirementsPath, requirements, "utf8");
    const changePath = join(changeRoot, "change.yaml");
    const change = parse(await readFile(changePath, "utf8")) as {
      next_action: {
        action: string;
      };
    };
    change.next_action.action = "start_implementation";
    await writeFile(changePath, stringify(change, { lineWidth: 0 }), "utf8");

    const unavailable = runCli(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(unavailable.status, 3);
    assert.match(unavailable.stdout, /next_action_not_available/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
