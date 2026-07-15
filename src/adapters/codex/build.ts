import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CoreManifest {
  core: {
    id: string;
    version: string;
  };
  runtime: {
    engine_range: string;
    cli: {
      command: string;
      entry: string;
    };
  };
  skills: Array<{
    id: string;
    entry: string;
  }>;
  adapters: Array<{
    id: string;
    entry: string;
    plugin: string;
  }>;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be a JSON object.");
  }
  return value as JsonObject;
}

async function readJson(path: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(path, "utf8")), path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function copyText(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await readFile(source, "utf8"), "utf8");
}

export async function projectCodexAdapter(
  manifest: CoreManifest,
  outputRoot: string,
): Promise<void> {
  const skill = manifest.skills.find((candidate) => candidate.id === manifest.core.id);
  if (manifest.skills.length !== 1 || skill === undefined) {
    throw new Error("Codex projection requires exactly one Skill matching the core id.");
  }
  const adapter = manifest.adapters.find((candidate) => candidate.id === "codex");
  if (manifest.adapters.length !== 1 || adapter === undefined) {
    throw new Error("Core manifest must declare exactly one first-version Codex adapter.");
  }
  const expectedEntry = "adapters/codex/.agents/plugins/marketplace.json";
  const expectedPlugin =
    "adapters/codex/plugins/" + manifest.core.id + "/.codex-plugin/plugin.json";
  if (adapter.entry !== expectedEntry || adapter.plugin !== expectedPlugin) {
    throw new Error("Codex adapter manifest paths do not match the fixed release layout.");
  }

  const plugin = await readJson("src/adapters/codex/templates/plugin.json");
  plugin.name = manifest.core.id;
  plugin.version = manifest.core.version;
  plugin.skills = "./skills/";

  const pluginRoot = join(outputRoot, "plugins", manifest.core.id);
  await writeJson(join(pluginRoot, ".codex-plugin", "plugin.json"), plugin);
  await copyText(
    join("src", ...skill.entry.split("/")),
    join(pluginRoot, "skills", skill.id, "SKILL.md"),
  );

  const marketplace = await readJson("src/adapters/codex/templates/marketplace.json");
  const plugins = marketplace.plugins;
  if (!Array.isArray(plugins) || plugins.length !== 1) {
    throw new Error("Codex marketplace template must contain exactly one plugin entry.");
  }
  const pluginEntry = object(plugins[0], "Codex marketplace plugin entry");
  pluginEntry.name = manifest.core.id;
  pluginEntry.source = {
    source: "local",
    path: "./plugins/" + manifest.core.id,
  };
  await writeJson(join(outputRoot, ".agents", "plugins", "marketplace.json"), marketplace);
  await copyText("src/adapters/codex/INSTALL.md", join(outputRoot, "INSTALL.md"));
  await copyText("src/adapters/codex/capability-map.md", join(outputRoot, "capability-map.md"));
}
