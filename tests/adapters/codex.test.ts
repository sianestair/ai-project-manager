import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test } from "vite-plus/test";
import { parse } from "yaml";

const distAdapterRoot = resolve("dist/adapters/codex");
const pluginName = "ai-project-manager";

test("Codex adapter is a single-source projection of core manifest and Skill", async () => {
  const manifest = parse(await readFile(resolve("src/core/manifest.yaml"), "utf8")) as {
    core: { id: string; version: string };
    skills: Array<{ id: string; entry: string }>;
    adapters: Array<{ id: string; entry: string; plugin: string }>;
  };
  assert.equal(manifest.core.id, pluginName);
  assert.deepEqual(manifest.adapters, [
    {
      id: "codex",
      entry: "adapters/codex/.agents/plugins/marketplace.json",
      plugin: "adapters/codex/plugins/ai-project-manager/.codex-plugin/plugin.json",
    },
  ]);

  const plugin = JSON.parse(
    await readFile(
      join(distAdapterRoot, "plugins", pluginName, ".codex-plugin", "plugin.json"),
      "utf8",
    ),
  );
  assert.equal(plugin.name, manifest.core.id);
  assert.equal(plugin.version, manifest.core.version);
  assert.equal(plugin.skills, "./skills/");
  assert.equal("hooks" in plugin, false);
  assert.equal("mcpServers" in plugin, false);
  assert.equal("apps" in plugin, false);

  const coreSkill = await readFile(resolve("src/core/skills/ai-project-manager/SKILL.md"), "utf8");
  const releaseCoreSkill = await readFile(
    resolve("dist/core/skills/ai-project-manager/SKILL.md"),
    "utf8",
  );
  const pluginSkill = await readFile(
    join(distAdapterRoot, "plugins", pluginName, "skills", pluginName, "SKILL.md"),
    "utf8",
  );
  assert.equal(releaseCoreSkill, coreSkill);
  assert.equal(pluginSkill, coreSkill);

  const sourceFiles = await readdir(resolve("src/adapters/codex"), { recursive: true });
  assert.equal(
    sourceFiles.some((path) => path.replaceAll("\\", "/").endsWith("/SKILL.md")),
    false,
  );
});

test("projected marketplace resolves one discoverable project manager Skill", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "pm-codex-adapter-"));
  try {
    await cp(distAdapterRoot, temporaryRoot, { recursive: true });
    const marketplace = JSON.parse(
      await readFile(join(temporaryRoot, ".agents", "plugins", "marketplace.json"), "utf8"),
    );
    assert.equal(marketplace.name, "ai-project-manager-local");
    assert.equal(marketplace.plugins.length, 1);
    const entry = marketplace.plugins[0];
    assert.deepEqual(entry.policy, {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    });
    assert.equal(entry.category, "Productivity");

    const pluginRoot = join(temporaryRoot, ...entry.source.path.slice(2).split("/"));
    const skillFiles = (await readdir(join(pluginRoot, "skills"), { recursive: true })).filter(
      (path) => path.replaceAll("\\", "/").endsWith("SKILL.md"),
    );
    assert.deepEqual(
      skillFiles.map((path) => path.replaceAll("\\", "/")),
      ["ai-project-manager/SKILL.md"],
    );
    const skill = await readFile(join(pluginRoot, "skills", skillFiles[0] ?? ""), "utf8");
    assert.match(skill, /^---\nname: ai-project-manager\n/u);

    const install = await readFile(join(temporaryRoot, "INSTALL.md"), "utf8");
    assert.match(install, /codex plugin marketplace add/u);
    assert.match(install, /pm --version/u);
    const capabilityMap = await readFile(join(temporaryRoot, "capability-map.md"), "utf8");
    assert.match(capabilityMap, /\| Hooks\s+\|\s+Not used/u);
    assert.match(capabilityMap, /\| Memory\s+\|\s+Convenience context only/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("portable core never imports the Codex adapter", async () => {
  const coreFiles = (await readdir(resolve("src/core"), { recursive: true })).filter((path) =>
    path.endsWith(".ts"),
  );
  for (const path of coreFiles) {
    const content = await readFile(resolve("src/core", path), "utf8");
    assert.doesNotMatch(content, /adapters[\\/]codex/u, path);
  }
});
