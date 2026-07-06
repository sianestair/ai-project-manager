#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultLocations,
  initializeProjectConfig,
  loadProjectConfig,
  projectContext,
  renderProjectContext,
  updateProjectConfig,
} from "../project/project-config.mjs";

function usage(exitCode = 0) {
  console.log(`Usage:
  projectctl [--project <path>] status [--json]
  projectctl [--project <path>] validate [--json]
  projectctl [--project <path>] context [--json]
  projectctl [--project <path>] init --project-name <name> --manager-name <name> --owner-name <name> --owner-address <address> [location options] [--json]
  projectctl [--project <path>] update [identity or location options] [--json]

Location options:
  --current-truth <path>
  --active-changes <path>
  --archived-changes <path>
  --engineering <path>`);
  process.exit(exitCode);
}

function parseArgs(args) {
  const options = { project: process.cwd(), json: false };
  const positional = [];
  const valued = new Set([
    "--project",
    "--project-name",
    "--manager-name",
    "--owner-name",
    "--owner-address",
    "--current-truth",
    "--active-changes",
    "--archived-changes",
    "--engineering",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (valued.has(arg)) {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    positional.push(arg);
  }
  return { options, positional };
}

function printResult(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value.contextText) {
    console.log(value.contextText);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function requireInitOptions(options) {
  const required = ["projectName", "managerName", "ownerName", "ownerAddress"];
  const missing = required.filter((key) => typeof options[key] !== "string" || options[key].trim().length === 0);
  if (missing.length > 0) {
    throw new Error(`Missing initialization options: ${missing.join(", ")}`);
  }
}

function updatePayload(options) {
  const locations = {};
  for (const [optionKey, locationKey] of [
    ["currentTruth", "currentTruth"],
    ["activeChanges", "activeChanges"],
    ["archivedChanges", "archivedChanges"],
    ["engineering", "engineering"],
  ]) {
    if (options[optionKey] !== undefined) {
      locations[locationKey] = options[optionKey];
    }
  }
  return {
    ...(options.projectName !== undefined ? { projectName: options.projectName } : {}),
    ...(options.managerName !== undefined ? { managerName: options.managerName } : {}),
    ...(options.ownerName !== undefined ? { ownerName: options.ownerName } : {}),
    ...(options.ownerAddress !== undefined ? { ownerAddress: options.ownerAddress } : {}),
    ...(Object.keys(locations).length > 0 ? { locations } : {}),
  };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command] = positional;
  if (!command || command === "--help" || command === "-h") {
    usage(0);
  }

  if (command === "init") {
    requireInitOptions(options);
    const result = initializeProjectConfig(options.project, {
      projectName: options.projectName,
      managerName: options.managerName,
      ownerName: options.ownerName,
      ownerAddress: options.ownerAddress,
      locations: {
        currentTruth: options.currentTruth ?? defaultLocations.currentTruth,
        activeChanges: options.activeChanges ?? defaultLocations.activeChanges,
        archivedChanges: options.archivedChanges ?? defaultLocations.archivedChanges,
        engineering: options.engineering ?? defaultLocations.engineering,
      },
    });
    printResult(result, options.json);
    return;
  }

  if (command === "update") {
    const updates = updatePayload(options);
    if (Object.keys(updates).length === 0) {
      throw new Error("update 至少需要一个身份或位置参数。");
    }
    printResult(updateProjectConfig(options.project, updates), options.json);
    return;
  }

  const loaded = loadProjectConfig(options.project);
  switch (command) {
    case "status":
    case "validate":
      printResult(loaded, options.json);
      if (command === "validate" && loaded.status !== "initialized") {
        process.exitCode = 1;
      }
      break;
    case "context": {
      const context = projectContext(loaded);
      printResult({ ...context, contextText: renderProjectContext(context) }, options.json);
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export { parseArgs };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const payload = {
      error: error instanceof Error ? error.message : String(error),
      code: error?.code ?? "projectctl-error",
      details: error?.details ?? null,
    };
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  });
}
