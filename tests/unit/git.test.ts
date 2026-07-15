import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "vite-plus/test";

import { digestProjectScope } from "../../src/core/runtime/project/git.js";

function runGit(projectRoot: string, args: readonly string[]) {
  return spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

test("engineering directory digest includes tracked and untracked non-ignored files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-range-digest-"));
  const engineeringRoot = join(projectRoot, "engineering");

  try {
    assert.equal(runGit(projectRoot, ["init", "-b", "main"]).status, 0);
    await mkdir(engineeringRoot, { recursive: true });
    await writeFile(join(projectRoot, ".gitignore"), "engineering/ignored.ts\n", "utf8");
    await writeFile(join(engineeringRoot, "tracked.ts"), "export const tracked = 1;\n", "utf8");
    await writeFile(join(engineeringRoot, "untracked.ts"), "export const untracked = 1;\n", "utf8");
    await writeFile(join(engineeringRoot, "ignored.ts"), "export const ignored = 1;\n", "utf8");
    assert.equal(runGit(projectRoot, ["add", ".gitignore", "engineering/tracked.ts"]).status, 0);

    const initial = await digestProjectScope(projectRoot, "engineering");
    await writeFile(join(engineeringRoot, "ignored.ts"), "export const ignored = 2;\n", "utf8");
    assert.equal(await digestProjectScope(projectRoot, "engineering"), initial);

    await writeFile(join(engineeringRoot, "untracked.ts"), "export const untracked = 2;\n", "utf8");
    assert.notEqual(await digestProjectScope(projectRoot, "engineering"), initial);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
