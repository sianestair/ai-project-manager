import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { defineConfig } from "vite-plus";
import { parse } from "yaml";

interface CoreManifest {
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
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(source: string, target: string): Promise<void> {
  if (!(await pathExists(source))) {
    return;
  }

  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

function readCoreManifest(value: unknown): CoreManifest {
  if (typeof value !== "object" || value === null || !("core" in value) || !("runtime" in value)) {
    throw new Error("src/core/manifest.yaml is missing core or runtime metadata.");
  }

  const manifest = value as CoreManifest;
  if (
    typeof manifest.core.id !== "string" ||
    typeof manifest.core.version !== "string" ||
    typeof manifest.runtime.engine_range !== "string" ||
    manifest.runtime.cli.command !== "pm" ||
    manifest.runtime.cli.entry !== "bin/pm.js"
  ) {
    throw new Error("src/core/manifest.yaml has invalid release metadata.");
  }

  return manifest;
}

async function writeReleaseAssets(): Promise<void> {
  const manifestSource = "src/core/manifest.yaml";
  const manifestText = await readFile(manifestSource, "utf8");
  const manifest = readCoreManifest(parse(manifestText));

  await mkdir("dist/core", { recursive: true });
  await writeFile("dist/core/manifest.yaml", manifestText, "utf8");
  await copyTree("src/core/schemas", "dist/core/schemas");
  await copyTree("src/core/skills", "dist/core/skills");

  const releasePackage = {
    name: manifest.core.id,
    version: manifest.core.version,
    private: true,
    description: "Portable, file-backed AI project manager core and CLI.",
    type: "module",
    bin: {
      [manifest.runtime.cli.command]: manifest.runtime.cli.entry,
    },
    engines: {
      node: manifest.runtime.engine_range,
    },
  };

  await writeFile("dist/package.json", JSON.stringify(releasePackage, null, 2) + "\n", "utf8");
}

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "docs/**", "node_modules/**", "pnpm-lock.yaml"],
    semi: true,
    singleQuote: false,
    sortPackageJson: false,
  },
  lint: {
    ignorePatterns: ["dist/**", "node_modules/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
  },
  pack: {
    entry: {
      "bin/pm": "src/core/runtime/cli/main.ts",
    },
    outDir: "dist",
    clean: true,
    format: ["esm"],
    platform: "node",
    target: "node24",
    fixedExtension: false,
    dts: false,
    sourcemap: false,
    minify: false,
    treeshake: true,
    deps: {
      alwaysBundle: ["ajv", "cac", "yaml"],
      onlyBundle: ["ajv", "cac", "fast-deep-equal", "fast-uri", "json-schema-traverse", "yaml"],
    },
    hooks: {
      "build:done": writeReleaseAssets,
    },
  },
});
