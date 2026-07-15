import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distRoot = join(workspaceRoot, "dist");
const temporaryRoot = await mkdtemp(join(tmpdir(), "pm-release-"));
const nodeDirectory = dirname(process.execPath);
const npmTool =
  process.platform === "win32"
    ? {
        command: process.execPath,
        prefix: [join(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js")],
      }
    : { command: "npm", prefix: [] };

function run(command, args, cwd, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      ...environment,
    },
  });

  if (result.status !== 0) {
    throw new Error(
      command + " " + args.join(" ") + " failed.\n" + result.stdout + "\n" + result.stderr,
    );
  }

  return result;
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(path.slice(root.length + 1).replaceAll("\\", "/"));
    }
  }

  return files;
}

function runPm(releaseRoot, args, cwd = releaseRoot) {
  return run(process.execPath, [join(releaseRoot, "bin", "pm.js"), ...args], cwd, {
    NODE_PATH: "",
    COREPACK_HOME: join(temporaryRoot, "empty-corepack"),
  });
}

async function smokeRelease(releaseRoot, projectRoot) {
  await mkdir(projectRoot, { recursive: true });

  const version = runPm(releaseRoot, ["--version"]);
  assert.equal(version.stdout.trim(), "0.1.0");
  runPm(releaseRoot, ["init", "--project", projectRoot, "--project-id", "release-smoke"]);
  runPm(releaseRoot, ["change", "start", "smoke-change", "--project", projectRoot]);

  const requirementsPath = join(
    projectRoot,
    "changes",
    "active",
    "smoke-change",
    "requirements.md",
  );
  const requirements = await readFile(requirementsPath, "utf8");
  await writeFile(
    requirementsPath,
    requirements
      .replace(
        "## 需求记录\n\n使用 `### REQ-001: 标题` 记录稳定需求标识；正文可自由组织。",
        "## 需求记录\n\n### REQ-001: 验证发布包\n\n- 说明：发布包必须可以独立运行。",
      )
      .replace(
        "## 验收标准\n\n使用 `### AC-001: 标题`，并通过 `- 追溯：REQ-001` 引用需求。",
        "## 验收标准\n\n### AC-001: CLI 可运行\n\n- 追溯：REQ-001\n- 断言：离线安装后的 CLI 可执行。",
      )
      .replace(
        "## 需求门前自检\n\n待执行。",
        "## 需求门前自检\n\n需求目标、范围、非范围和验收标准均已检查。",
      ),
    "utf8",
  );
  const confirmation = runPm(releaseRoot, [
    "confirm",
    "requirements",
    "smoke-change",
    "--confirmed-by",
    "user",
    "--summary",
    "Release smoke requirements baseline.",
    "--evidence",
    "Explicit release smoke confirmation.",
    "--project",
    projectRoot,
    "--json",
  ]);
  assert.equal(JSON.parse(confirmation.stdout).revision, 1);

  const status = runPm(releaseRoot, ["status", "smoke-change", "--project", projectRoot, "--json"]);
  assert.equal(JSON.parse(status.stdout).change.phase, "design");
  assert.equal(JSON.parse(status.stdout).gates.requirements.valid, true);
  const invalidation = runPm(releaseRoot, [
    "invalidate",
    "requirements",
    "smoke-change",
    "--reason",
    "Release smoke rollback.",
    "--project",
    projectRoot,
    "--json",
  ]);
  assert.equal(JSON.parse(invalidation.stdout).nextAction, "revise_requirements");

  const rolledBack = runPm(releaseRoot, [
    "status",
    "smoke-change",
    "--project",
    projectRoot,
    "--json",
  ]);
  assert.equal(JSON.parse(rolledBack.stdout).change.phase, "requirements");
  assert.equal(JSON.parse(rolledBack.stdout).gates.requirements.valid, false);
  const validation = runPm(releaseRoot, [
    "validate",
    "smoke-change",
    "--project",
    projectRoot,
    "--json",
  ]);
  assert.equal(JSON.parse(validation.stdout).valid, true);
}

try {
  const releaseFiles = await collectFiles(distRoot);
  for (const required of [
    "package.json",
    "bin/pm.js",
    "core/manifest.yaml",
    "core/schemas/project.schema.json",
    "core/schemas/change.schema.json",
    "core/schemas/knowledge-patch.schema.json",
    "core/skills/ai-project-manager/SKILL.md",
    "adapters/codex/.agents/plugins/marketplace.json",
    "adapters/codex/plugins/ai-project-manager/.codex-plugin/plugin.json",
    "adapters/codex/plugins/ai-project-manager/skills/ai-project-manager/SKILL.md",
    "adapters/codex/INSTALL.md",
    "adapters/codex/capability-map.md",
  ]) {
    assert.equal(releaseFiles.includes(required), true, "dist is missing " + required);
  }

  for (const forbidden of releaseFiles.filter(
    (path) =>
      path.endsWith(".ts") ||
      path.endsWith(".d.ts") ||
      path.endsWith(".map") ||
      path.startsWith("tests/") ||
      path.startsWith("docs/") ||
      path.startsWith("node_modules/"),
  )) {
    assert.fail("dist contains forbidden file " + forbidden);
  }

  const releasePackage = JSON.parse(await readFile(join(distRoot, "package.json"), "utf8"));
  assert.equal(releasePackage.name, "ai-project-manager");
  assert.equal(releasePackage.version, "0.1.0");
  assert.deepEqual(releasePackage.bin, { pm: "bin/pm.js" });
  assert.equal("dependencies" in releasePackage, false);
  assert.equal("devDependencies" in releasePackage, false);

  const pluginManifest = JSON.parse(
    await readFile(
      join(
        distRoot,
        "adapters",
        "codex",
        "plugins",
        "ai-project-manager",
        ".codex-plugin",
        "plugin.json",
      ),
      "utf8",
    ),
  );
  assert.equal(pluginManifest.name, releasePackage.name);
  assert.equal(pluginManifest.version, releasePackage.version);
  assert.equal(pluginManifest.skills, "./skills/");
  const coreSkill = await readFile(
    join(distRoot, "core", "skills", "ai-project-manager", "SKILL.md"),
    "utf8",
  );
  const projectedSkill = await readFile(
    join(
      distRoot,
      "adapters",
      "codex",
      "plugins",
      "ai-project-manager",
      "skills",
      "ai-project-manager",
      "SKILL.md",
    ),
    "utf8",
  );
  assert.equal(projectedSkill, coreSkill);
  const marketplace = JSON.parse(
    await readFile(
      join(distRoot, "adapters", "codex", ".agents", "plugins", "marketplace.json"),
      "utf8",
    ),
  );
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, releasePackage.name);
  assert.equal(marketplace.plugins[0].source.path, "./plugins/ai-project-manager");

  const bundle = await readFile(join(distRoot, "bin", "pm.js"), "utf8");
  assert.match(bundle, /^#!\/usr\/bin\/env node/u);
  const externalSpecifiers = [
    ...bundle.matchAll(/^import\s+[^\r\n]*?\sfrom\s+["']([^"']+)["'];?$/gmu),
    ...bundle.matchAll(/^import\s+["']([^"']+)["'];?$/gmu),
  ].map((match) => match[1]);
  for (const specifier of externalSpecifiers) {
    assert.equal(
      isBuiltin(specifier),
      true,
      "bundle retains non-Node external import " + specifier,
    );
  }

  const copiedRelease = join(temporaryRoot, "copied-release");
  await cp(distRoot, copiedRelease, { recursive: true });
  await smokeRelease(copiedRelease, join(temporaryRoot, "copied-project"));

  const packed = run(
    npmTool.command,
    [...npmTool.prefix, "pack", "--json", "--pack-destination", temporaryRoot],
    copiedRelease,
  );
  const packResult = JSON.parse(packed.stdout);
  assert.equal(Array.isArray(packResult), true);
  assert.equal(packResult.length, 1);
  const packedFiles = packResult[0].files.map((entry) => entry.path).sort(comparePaths);
  assert.deepEqual(packedFiles, [...releaseFiles].sort(comparePaths));

  const installRoot = join(temporaryRoot, "offline-install");
  await mkdir(installRoot, { recursive: true });
  await writeFile(
    join(installRoot, "package.json"),
    JSON.stringify(
      {
        name: "offline-release-smoke",
        version: "1.0.0",
        private: true,
      },
      null,
      2,
    ),
    "utf8",
  );
  run(
    npmTool.command,
    [
      ...npmTool.prefix,
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temporaryRoot, packResult[0].filename),
    ],
    installRoot,
  );
  const installedRoot = join(installRoot, "node_modules", "ai-project-manager");
  assert.equal(runPm(installedRoot, ["--version"], installRoot).stdout.trim(), "0.1.0");

  console.log("Self-contained dist and offline tarball verification passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
