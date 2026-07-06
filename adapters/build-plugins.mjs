#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distRoot = path.join(root, "dist");
const pluginsRoot = path.join(root, "plugins");
const pluginName = "project-manager";
const version = "0.2.0";
const description = "Give each project one named AI project manager who coordinates work from intent through acceptance and archive.";

function ensureInside(parent, target) {
  const relative = path.relative(parent, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside ${parent}: ${target}`);
  }
}

function removeGenerated(parent, target) {
  ensureInside(parent, target);
  removeTree(target);
  if (fs.existsSync(target)) {
    throw new Error(`Failed to remove generated path: ${target}`);
  }
}

function removeTree(target) {
  if (!fs.existsSync(target)) {
    return;
  }
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fs.unlinkSync(target);
    return;
  }
  for (const entry of fs.readdirSync(target)) {
    removeTree(path.join(target, entry));
  }
  fs.rmdirSync(target);
}

function resetPluginRoot(pluginRoot) {
  ensureInside(pluginsRoot, pluginRoot);
  ensureDir(pluginRoot);
  for (const entry of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
    if (entry.name === "node_modules") {
      continue;
    }
    removeGenerated(pluginRoot, path.join(pluginRoot, entry.name));
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, options = {}) {
  if (!fs.existsSync(src)) {
    return;
  }
  const exclude = options.exclude ?? (() => false);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (exclude(srcPath, entry)) {
      continue;
    }
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, options);
    } else if (entry.isFile()) {
      copyFile(srcPath, destPath);
    }
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePackageJson(pluginRoot) {
  writeJson(path.join(pluginRoot, "package.json"), {
    name: pluginName,
    version,
    private: true,
    type: "module",
    bin: {
      projectctl: "./bin/projectctl.mjs",
      changeplan: "./bin/changeplan.mjs",
      changeflow: "./bin/changeflow.mjs",
      "validate-change-schema": "./bin/validate-schema.mjs",
    },
    dependencies: {
      "@fission-ai/openspec": "^1.4.1",
      yaml: "^2.8.2",
    },
  });
}

function copyRuntime(pluginRoot) {
  copyDir(path.join(root, "runtime"), path.join(pluginRoot, "runtime"));
  copyDir(path.join(root, "runtime", "cli"), path.join(pluginRoot, "bin"));
  copyDir(path.join(root, "runtime", "project"), path.join(pluginRoot, "project"));
  copyDir(path.join(root, "node_modules"), path.join(pluginRoot, "node_modules"));
}

function copyPluginContent(pluginRoot) {
  copyDir(
    path.join(root, "content", "skills", "project-manager"),
    path.join(pluginRoot, "skills", "project-manager"),
  );
  copyDir(path.join(root, "content", "skills"), path.join(pluginRoot, "internal", "skills"), {
    exclude: (srcPath, entry) => entry.isDirectory() && path.basename(srcPath) === "project-manager",
  });
  copyDir(path.join(root, "profiles"), path.join(pluginRoot, "profiles"), {
    exclude: (srcPath, entry) => (
      entry.isDirectory()
      && entry.name === "claude"
      && path.basename(path.dirname(srcPath)) === "agents"
    ),
  });
  copyDir(path.join(root, "hooks"), path.join(pluginRoot, "hooks"));
  copyDir(
    path.join(root, "profiles", "vowup", "agents", "codex"),
    path.join(pluginRoot, "agents", "codex"),
  );
}

function codexManifest() {
  return {
    name: pluginName,
    version,
    description,
    author: {
      name: "local",
    },
    license: "UNLICENSED",
    keywords: ["project-manager", "planning", "workflow", "codex"],
    skills: "./skills/",
    interface: {
      displayName: "AI 项目经理",
      shortDescription: "为每个项目初始化一位具名 AI 项目经理。",
      longDescription: "AI 项目经理认识项目业务负责人，协调调研、规划、实施、验收、知识回写和归档，并在新会话中恢复项目身份。",
      developerName: "local",
      category: "Productivity",
      capabilities: ["Interactive", "Write", "Automation"],
      defaultPrompt: [
        "@project-manager 初始化",
        "让项目经理汇报当前项目状态。",
        "让项目经理继续推进当前项目。",
      ],
    },
  };
}

function buildCodex() {
  const pluginRoot = path.join(pluginsRoot, pluginName);
  resetPluginRoot(pluginRoot);
  copyPluginContent(pluginRoot);
  copyRuntime(pluginRoot);
  writePackageJson(pluginRoot);
  writeJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"), codexManifest());
  return pluginRoot;
}

function cleanLegacyOutputs() {
  removeGenerated(distRoot, path.join(distRoot, "codex", "change-delivery"));
  removeGenerated(distRoot, path.join(distRoot, "claude-code", "change-delivery"));
  removeGenerated(distRoot, path.join(distRoot, "codex", pluginName));
}

function main() {
  ensureDir(distRoot);
  ensureDir(pluginsRoot);
  cleanLegacyOutputs();
  const codexRoot = buildCodex();
  writeJson(path.join(distRoot, "build-summary.json"), {
    generatedAt: new Date().toISOString(),
    plugins: {
      codex: codexRoot,
    },
  });
  console.log(`Generated Codex plugin: ${codexRoot}`);
}

main();
