#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowRoot = findWorkflowRoot(__dirname);
const defaultProfile = "vowup";
let resolver = null;

function findWorkflowRoot(startDir) {
  let current = startDir;
  while (true) {
    if (
      fs.existsSync(path.join(current, "package.json"))
      && fs.existsSync(path.join(current, "profiles"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Cannot find project-manager plugin root from ${startDir}`);
    }
    current = parent;
  }
}

async function loadResolver() {
  if (resolver) {
    return resolver;
  }
  resolver = await import(pathToFileURL(path.join(
    workflowRoot,
    "node_modules/@fission-ai/openspec/dist/core/artifact-graph/resolver.js",
  )).href);
  return resolver;
}

function usage(exitCode = 0) {
  const text = `
Usage:
  validate-change-schema [schema-name] [--profile <name>] [--json]

Validates schemas bundled with the project-manager plugin without invoking the raw OpenSpec CLI.
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseArgs(args) {
  const options = { json: false, profile: defaultProfile };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      usage(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --profile");
      }
      options.profile = value;
      index += 1;
      continue;
    }
    positional.push(arg);
  }

  return {
    options,
    schemaName: positional[0] ?? "vowup-change",
  };
}

function profileRoot(profileName) {
  const root = path.join(workflowRoot, "profiles", profileName);
  if (!fs.existsSync(path.join(root, "openspec", "config.yaml"))) {
    throw new Error(`Profile '${profileName}' not found or missing openspec/config.yaml.`);
  }
  return root;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function validateSchema(schemaName, profileName) {
  const issues = [];
  const profile = profileRoot(profileName);
  const schemaDir = resolver.getSchemaDir(schemaName, profile);

  if (!schemaDir) {
    return {
      valid: false,
      schemaName,
      workflowRoot,
      profileName,
      profileRoot: profile,
      schemaDir: null,
      issues: [
        {
          level: "error",
          path: "schema.yaml",
          message: `Schema not found: ${schemaName}`,
        },
      ],
    };
  }

  let schema = null;
  try {
    schema = resolver.resolveSchema(schemaName, profile);
  } catch (error) {
    issues.push({
      level: "error",
      path: "schema.yaml",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (schema) {
    for (const artifact of schema.artifacts) {
      const templateInTemplates = path.join(schemaDir, "templates", artifact.template);
      const templateInRoot = path.join(schemaDir, artifact.template);
      if (!fs.existsSync(templateInTemplates) && !fs.existsSync(templateInRoot)) {
        issues.push({
          level: "error",
          path: `artifacts.${artifact.id}.template`,
          message: `Template file '${artifact.template}' not found for artifact '${artifact.id}'`,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    schemaName,
    workflowRoot,
    profileName,
    profileRoot: profile,
    schemaDir,
    artifacts: schema ? schema.artifacts.map((artifact) => artifact.id) : [],
    issues,
  };
}

async function main() {
  await loadResolver();
  const { options, schemaName } = parseArgs(process.argv.slice(2));
  const result = validateSchema(schemaName, options.profile);

  if (options.json) {
    printJson(result);
  } else if (result.valid) {
    console.log(`Schema '${schemaName}' is valid.`);
  } else {
    console.error(`Schema '${schemaName}' is invalid.`);
    for (const issue of result.issues) {
      console.error(`- ${issue.path}: ${issue.message}`);
    }
  }

  process.exit(result.valid ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
