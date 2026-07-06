import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify as stringifyYaml } from "yaml";
import {
  createProjectConfig,
  initializeProjectConfig,
  loadProjectConfig,
  updateProjectConfig,
  validateProjectConfig,
} from "../runtime/project/project-config.mjs";

function temporaryProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-manager-test-"));
  fs.mkdirSync(path.join(root, ".git"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function validInput() {
  return {
    projectName: "VowUp",
    managerName: "林舟",
    ownerName: "张三",
    ownerAddress: "张总",
  };
}

test("uninitialized project resolves to the git root", (t) => {
  const root = temporaryProject(t);
  const nested = path.join(root, "engineering", "apps");
  fs.mkdirSync(nested, { recursive: true });

  const result = loadProjectConfig(nested);
  assert.equal(result.status, "uninitialized");
  assert.equal(result.projectRoot, root);
  assert.equal(result.configPath, path.join(root, "project.yaml"));
});

test("initialization writes one valid project.yaml and nested paths reload it", (t) => {
  const root = temporaryProject(t);
  const result = initializeProjectConfig(root, validInput());

  assert.equal(result.status, "initialized");
  assert.equal(result.config.projectManager.name, "林舟");
  assert.equal(result.config.businessOwner.preferredAddress, "张总");
  assert.equal(result.config.locations.currentTruth, "knowledge-base/project");

  const nested = path.join(root, "engineering", "contracts");
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(loadProjectConfig(nested).projectRoot, root);
  assert.throws(() => initializeProjectConfig(root, validInput()), /不能重复初始化/);
});

test("validation rejects unknown fields and locations outside the project", (t) => {
  const root = temporaryProject(t);
  const config = createProjectConfig(validInput());
  config.extra = true;
  config.locations.engineering = "../outside";

  const result = validateProjectConfig(config, root);
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((finding) => finding.code === "unknown-field"));
  assert.ok(result.findings.some((finding) => finding.code === "location-outside-project"));
});

test("explicit update changes only requested initialized fields", (t) => {
  const root = temporaryProject(t);
  initializeProjectConfig(root, validInput());

  const result = updateProjectConfig(root, { managerName: "陈默", ownerAddress: "张老师" });
  assert.equal(result.config.projectManager.name, "陈默");
  assert.equal(result.config.businessOwner.preferredAddress, "张老师");
  assert.equal(result.config.businessOwner.name, "张三");
  assert.equal(result.config.locations.currentTruth, "knowledge-base/project");
});

test("an unrelated project.yaml is reported invalid and is never overwritten", (t) => {
  const root = temporaryProject(t);
  fs.writeFileSync(path.join(root, "project.yaml"), stringifyYaml({ schema: "another-tool", version: 1 }), "utf8");

  const result = loadProjectConfig(root);
  assert.equal(result.status, "invalid");
  assert.ok(result.findings.some((finding) => finding.code === "invalid-schema"));
  assert.throws(() => initializeProjectConfig(root, validInput()), /不能重复初始化/);
});
