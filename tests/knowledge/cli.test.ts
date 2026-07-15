import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { test } from "vite-plus/test";

import { createKnowledgeProject } from "../helpers/knowledge-project.js";

const cliPath = resolve("dist/bin/pm.js");

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("dist CLI completes knowledge confirmation, atomic apply, and archive", async () => {
  const changeId = "knowledge-cli";
  const fixture = await createKnowledgeProject(changeId);
  const projectArgs = ["--project", fixture.projectRoot, "--json"] as const;
  try {
    const preview = runCli(["knowledge", "preview", changeId, ...projectArgs]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).targetCount, 3);

    const confirm = runCli([
      "confirm",
      "knowledge",
      changeId,
      "--confirmed-by",
      "user",
      "--summary",
      "Confirmed the exact knowledge patch.",
      "--evidence",
      "Explicit CLI acceptance fixture confirmation.",
      ...projectArgs,
    ]);
    assert.equal(confirm.status, 0, confirm.stderr);
    assert.equal(JSON.parse(confirm.stdout).nextAction, "apply_knowledge");

    const apply = runCli(["knowledge", "apply", changeId, ...projectArgs]);
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal(JSON.parse(apply.stdout).phase, "archive_ready");

    const check = runCli(["archive", "check", changeId, ...projectArgs]);
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).ready, true);

    const archive = runCli(["archive", "apply", changeId, ...projectArgs]);
    assert.equal(archive.status, 0, archive.stderr);
    assert.equal(JSON.parse(archive.stdout).archivedPath, "changes/archived/" + changeId);
    assert.equal(await exists(fixture.changeRoot), false);

    const validate = runCli(["validate", changeId, ...projectArgs]);
    assert.equal(validate.status, 0, validate.stderr);
    const archived = JSON.parse(validate.stdout);
    assert.equal(archived.valid, true);
    assert.equal(archived.state.change.location, "archived");
    assert.deepEqual(
      archived.state.available_actions.map((action: { id: string }) => action.id),
      ["inspect_archive"],
    );

    const status = runCli(["status", changeId, ...projectArgs]);
    assert.notEqual(status.status, 0);
    assert.match(status.stderr, /change_not_found/);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});
