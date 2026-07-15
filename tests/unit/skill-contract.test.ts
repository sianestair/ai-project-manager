import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { test } from "vite-plus/test";
import { parse } from "yaml";

const skillPath = resolve("src/core/skills/ai-project-manager/SKILL.md");
const manifestPath = resolve("src/core/manifest.yaml");

function parseSkill(content: string): { metadata: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(content);
  assert.notEqual(match, null, "Skill must use YAML frontmatter.");
  return {
    metadata: parse(match?.[1] ?? "") as Record<string, unknown>,
    body: match?.[2] ?? "",
  };
}

test("portable project manager Skill has focused metadata and no platform-specific path", async () => {
  const content = await readFile(skillPath, "utf8");
  const { metadata, body } = parseSkill(content);

  assert.deepEqual(Object.keys(metadata).sort(), ["description", "name"]);
  assert.equal(metadata.name, "ai-project-manager");
  assert.match(String(metadata.description), /PROJECT\.yaml/u);
  assert.match(String(metadata.description), /starting or resuming/u);
  assert.doesNotMatch(body, /Codex|ChatGPT|\.codex|\.agents/u);
  assert.doesNotMatch(content, /\[TODO|TODO:/u);
  assert.ok(content.split("\n").length < 500, "Skill should remain progressively loadable.");
});

test("Skill covers authority, recovery, gates, evidence, knowledge, and archive contracts", async () => {
  const content = await readFile(skillPath, "utf8");
  for (const required of [
    "AGENTS.md",
    "PROJECT.yaml",
    "knowledge-base/",
    "changes/active/",
    "changes/archived/",
    "pm status",
    "pm validate",
    "pm confirm",
    "pm invalidate",
    "pm knowledge preview",
    "pm knowledge apply",
    "pm knowledge recover",
    "pm archive check",
    "pm archive apply",
    "readiness.assessed_artifacts",
    "non_converging",
    "Completeness",
    "Correctness",
    "Coherence",
    "Engineering quality",
    "knowledge-post-images/",
    "before/after",
    "inspect_archive",
  ]) {
    assert.match(content, new RegExp(required.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  assert.ok(
    content.indexOf("## Before every confirmation") < content.indexOf("pm confirm <"),
    "The universal pre-confirmation procedure must precede the confirmation command.",
  );
});

test("core manifest declares exactly one portable Skill projection", async () => {
  const manifest = parse(await readFile(manifestPath, "utf8")) as {
    skills: Array<{ id: string; entry: string }>;
  };

  assert.deepEqual(manifest.skills, [
    {
      id: "ai-project-manager",
      entry: "core/skills/ai-project-manager/SKILL.md",
    },
  ]);
});
