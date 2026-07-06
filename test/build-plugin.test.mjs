import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const pluginRoot = path.join(root, "plugins", "project-manager");

test("build emits one public skill, hooks, internal workflows, and a valid marketplace source", () => {
  fs.mkdirSync(path.join(pluginRoot, "profiles", "vowup", "agents", "claude"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, "profiles", "vowup", "agents", "claude", "stale.md"), "stale", "utf8");
  execFileSync(process.execPath, [path.join(root, "adapters", "build-plugins.mjs")], { cwd: root });

  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, "project-manager");
  assert.equal(manifest.interface.displayName, "AI 项目经理");
  assert.equal(Object.hasOwn(manifest, "hooks"), false);

  const publicSkills = fs.readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(publicSkills, ["project-manager"]);

  assert.equal(fs.existsSync(path.join(pluginRoot, "hooks", "hooks.json")), true);
  assert.equal(fs.existsSync(path.join(pluginRoot, "internal", "skills", "change-plan", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(pluginRoot, "profiles", "vowup", "skills", "vowup-change-lead", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(pluginRoot, "profiles", "vowup", "agents", "claude")), false);
  assert.equal(fs.existsSync(path.join(pluginRoot, "bin", "projectctl.mjs")), true);

  const temporaryProject = fs.mkdtempSync(path.join(os.tmpdir(), "built-project-manager-"));
  try {
    fs.mkdirSync(path.join(temporaryProject, ".git"));
    execFileSync(process.execPath, [
      path.join(pluginRoot, "bin", "projectctl.mjs"),
      "--project", temporaryProject,
      "init",
      "--project-name", "SmokeProject",
      "--manager-name", "Lin",
      "--owner-name", "Owner",
      "--owner-address", "Boss",
      "--json",
    ]);
    assert.equal(fs.existsSync(path.join(temporaryProject, "project.yaml")), true);
  } finally {
    fs.rmSync(temporaryProject, { recursive: true, force: true });
  }

  const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
  const entry = marketplace.plugins.find((plugin) => plugin.name === "project-manager");
  assert.equal(entry.source.path, "./plugins/project-manager");
  assert.equal(fs.existsSync(path.resolve(root, entry.source.path)), true);

  assert.equal(fs.existsSync(path.join(root, "dist", "codex", "change-delivery")), false);
  assert.equal(fs.existsSync(path.join(root, "dist", "claude-code", "change-delivery")), false);
});
