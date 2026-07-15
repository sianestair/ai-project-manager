import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test } from "vite-plus/test";

import { previewKnowledge } from "../../src/core/runtime/operations/knowledge-preview.js";
import { PmError } from "../../src/core/runtime/cli/errors.js";
import { resolveCanonicalState } from "../../src/core/runtime/state/resolver.js";
import { createKnowledgeProject } from "../helpers/knowledge-project.js";

test("knowledge preview produces a byte-stable patch with explicit before and after images", async () => {
  const fixture = await createKnowledgeProject("knowledge-preview");
  try {
    const first = await previewKnowledge({
      project: fixture.projectRoot,
      changeId: "knowledge-preview",
    });
    const firstBytes = await readFile(join(fixture.changeRoot, "knowledge.patch"), "utf8");
    const second = await previewKnowledge({
      project: fixture.projectRoot,
      changeId: "knowledge-preview",
    });
    const secondBytes = await readFile(join(fixture.changeRoot, "knowledge.patch"), "utf8");

    assert.equal(first.targetCount, 3);
    assert.equal(first.patchDigest, second.patchDigest);
    assert.equal(firstBytes, secondBytes);
    const patch = JSON.parse(firstBytes);
    assert.deepEqual(
      patch.targets.map((target: { operation: string }) => target.operation),
      ["delete", "replace", "create"],
    );
    assert.equal(patch.targets[0].before_image, fixture.obsoleteDecision);
    assert.equal(patch.targets[0].after_image, null);
    assert.equal(patch.targets[1].before_image, fixture.originalFact);
    assert.equal(patch.targets[1].after_image, fixture.replacementFact);
    assert.equal(first.diff.includes("+++ b/knowledge-base/rules/fixture/atomic.md"), true);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("knowledge preview rejects targets outside the fixed knowledge contract", async () => {
  const fixture = await createKnowledgeProject("knowledge-path-safety");
  try {
    const path = join(fixture.changeRoot, "knowledge-update.md");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "knowledge-base/facts/fixture/current.md",
        "../engineering/escaped.md",
      ),
    );
    await assert.rejects(
      previewKnowledge({ project: fixture.projectRoot, changeId: "knowledge-path-safety" }),
      (error: unknown) => error instanceof PmError && error.exitCode === 3,
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("a damaged unconfirmed patch remains regenerable from its authoritative candidates", async () => {
  const changeId = "knowledge-regenerate";
  const fixture = await createKnowledgeProject(changeId);
  try {
    await previewKnowledge({ project: fixture.projectRoot, changeId });
    await writeFile(join(fixture.changeRoot, "knowledge.patch"), "not-json\n");
    const damaged = await resolveCanonicalState({ project: fixture.projectRoot, changeId });
    assert.equal(
      damaged.available_actions.some((action) => action.id === "preview_knowledge"),
      true,
    );
    assert.equal(
      damaged.diagnostics.some(
        (item) => item.code === "knowledge_patch_invalid" && item.severity === "warning",
      ),
      true,
    );

    const regenerated = await previewKnowledge({ project: fixture.projectRoot, changeId });
    assert.equal(regenerated.targetCount, 3);
    await assert.doesNotReject(async () =>
      JSON.parse(await readFile(join(fixture.changeRoot, "knowledge.patch"), "utf8")),
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("knowledge preview rejects unresolved candidate handling", async () => {
  const changeId = "knowledge-unresolved";
  const fixture = await createKnowledgeProject(changeId);
  try {
    const path = join(fixture.changeRoot, "knowledge-update.md");
    const lines = (await readFile(path, "utf8")).split("\n");
    const heading = lines.findIndex((line) => line.includes("KNOW-001"));
    assert.notEqual(heading, -1);
    const handling = heading + 6;
    lines.splice(handling, 1);
    await writeFile(path, lines.join("\n"));

    await assert.rejects(
      previewKnowledge({ project: fixture.projectRoot, changeId }),
      (error: unknown) => error instanceof PmError && error.code === "knowledge_candidate_invalid",
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("knowledge preview rejects duplicate target paths", async () => {
  const changeId = "knowledge-duplicate";
  const fixture = await createKnowledgeProject(changeId);
  try {
    const path = join(fixture.changeRoot, "knowledge-update.md");
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### KNOW-001");
    const end = content.indexOf("### KNOW-002");
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const duplicate = content.slice(start, end).replace("KNOW-001", "KNOW-004");
    await writeFile(path, content.slice(0, end) + duplicate + content.slice(end));

    await assert.rejects(
      previewKnowledge({ project: fixture.projectRoot, changeId }),
      (error: unknown) => error instanceof PmError && error.code === "knowledge_target_duplicate",
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});
