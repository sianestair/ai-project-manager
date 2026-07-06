#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowRoot = findWorkflowRoot(__dirname);
const defaultProfile = "vowup";
const defaultSchema = "vowup-change";
let openspec = null;

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

async function importFromRoot(relativePath) {
  return import(pathToFileURL(path.join(workflowRoot, relativePath)).href);
}

async function loadOpenSpec() {
  if (openspec) {
    return openspec;
  }

  const resolver = await importFromRoot("node_modules/@fission-ai/openspec/dist/core/artifact-graph/resolver.js");
  const instructionLoader = await importFromRoot("node_modules/@fission-ai/openspec/dist/core/artifact-graph/instruction-loader.js");
  const workflowInstructions = await importFromRoot("node_modules/@fission-ai/openspec/dist/commands/workflow/instructions.js");
  const changeUtils = await importFromRoot("node_modules/@fission-ai/openspec/dist/utils/change-utils.js");

  openspec = {
    getSchemaDir: resolver.getSchemaDir,
    loadChangeContext: instructionLoader.loadChangeContext,
    generateInstructions: instructionLoader.generateInstructions,
    formatChangeStatus: instructionLoader.formatChangeStatus,
    generateApplyInstructions: workflowInstructions.generateApplyInstructions,
    validateChangeName: changeUtils.validateChangeName,
  };
  return openspec;
}

function usage(exitCode = 0) {
  const text = `
Usage:
  changeplan [--project <path>] [--profile <name>] new <change-id> [--description "..."] [--schema <name>]
  changeplan [--project <path>] [--profile <name>] list [--json]
  changeplan [--project <path>] [--profile <name>] status <change-id> [--json]
  changeplan [--project <path>] [--profile <name>] instructions <artifact-id|apply> --change <change-id> [--json]
  changeplan [--project <path>] [--profile <name>] archive <change-id>

changeplan uses schemas and templates bundled with the project-manager plugin, and target-project change directories:
  <project>/changes/active/<change-id>
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseArgs(args) {
  const options = {};
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options[arg.slice(2)] = true;
      continue;
    }
    if (arg === "--project" || arg === "--change" || arg === "--schema" || arg === "--description" || arg === "--profile") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    positional.push(arg);
  }

  return { options, positional };
}

function resolveProfile(profileOption) {
  const profileName = profileOption ?? defaultProfile;
  const profileRoot = path.join(workflowRoot, "profiles", profileName);
  const configPath = path.join(profileRoot, "openspec", "config.yaml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Profile '${profileName}' not found or missing openspec/config.yaml at ${configPath}`);
  }
  return { profileName, profileRoot };
}

function targetContext(options) {
  const projectOption = options.project;
  const projectRoot = path.resolve(projectOption ?? process.cwd());
  const profile = resolveProfile(options.profile);
  return {
    projectRoot,
    activeDir: path.join(projectRoot, "changes", "active"),
    archivedDir: path.join(projectRoot, "changes", "archived"),
    ...profile,
  };
}

function readConfig(ctx) {
  const configPath = path.join(ctx.profileRoot, "openspec", "config.yaml");
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, "utf8");
  return parseYaml(raw) ?? {};
}

function schemaFromConfig(ctx) {
  const config = readConfig(ctx);
  return typeof config.schema === "string" && config.schema.length > 0 ? config.schema : defaultSchema;
}

function planningHome(ctx) {
  return {
    kind: "repo",
    root: ctx.projectRoot,
    changesDir: ctx.activeDir,
    defaultSchema: schemaFromConfig(ctx),
  };
}

function changeDir(ctx, changeId) {
  return path.join(ctx.activeDir, changeId);
}

function ensureValidChangeId(changeId) {
  const result = openspec.validateChangeName(changeId);
  if (!result.valid) {
    throw new Error(`Invalid change id '${changeId}': ${result.error}`);
  }
}

function readMetadata(dir) {
  const metadataPath = path.join(dir, ".openspec.yaml");
  if (!fs.existsSync(metadataPath)) {
    return {};
  }
  return parseYaml(fs.readFileSync(metadataPath, "utf8")) ?? {};
}

function loadContext(ctx, changeId, schemaName) {
  return openspec.loadChangeContext(ctx.profileRoot, changeId, schemaName, {
    changeDir: changeDir(ctx, changeId),
    planningHome: planningHome(ctx),
  });
}

function existingChanges(ctx) {
  if (!fs.existsSync(ctx.activeDir)) {
    return [];
  }
  return fs.readdirSync(ctx.activeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const dir = path.join(ctx.activeDir, entry.name);
      const metadata = readMetadata(dir);
      return {
        id: entry.name,
        path: dir,
        schema: metadata.schema ?? null,
        created: metadata.created ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function commandHint(ctx, command) {
  return `changeplan --project "${ctx.projectRoot}" --profile "${ctx.profileName}" ${command}`;
}

function normalizeWrapperCommandHints(ctx, text) {
  if (typeof text !== "string") {
    return text;
  }
  return text.replace(
    /Run openspec instructions ([^ ]+) --change "([^"]+)" --json before writing that artifact\./g,
    (_match, artifact, changeName) => `Run ${commandHint(ctx, `instructions ${artifact} --change "${changeName}" --json`)} before writing that artifact.`,
  );
}

function normalizeStatusPayload(ctx, payload) {
  return {
    ...payload,
    targetProjectRoot: ctx.projectRoot,
    workflowRoot,
    profileName: ctx.profileName,
    profileRoot: ctx.profileRoot,
    actionContext: payload.actionContext
      ? {
          ...payload.actionContext,
          allowedEditRoots: [ctx.projectRoot],
          constraints: [
            "Target-project change artifacts and implementation edits are scoped to the target project.",
          ],
        }
      : payload.actionContext,
    nextSteps: Array.isArray(payload.nextSteps)
      ? payload.nextSteps.map((step) => normalizeWrapperCommandHints(ctx, step))
      : payload.nextSteps,
  };
}

function normalizeApplyPayload(ctx, payload) {
  const normalized = {
    ...payload,
    targetProjectRoot: ctx.projectRoot,
    workflowRoot,
    profileName: ctx.profileName,
    profileRoot: ctx.profileRoot,
    instruction: normalizeWrapperCommandHints(ctx, payload.instruction),
  };

  if (normalized.state !== "blocked" || typeof normalized.instruction !== "string") {
    return normalized;
  }

  const missingMatch = normalized.instruction.match(/Missing artifacts: ([^.]+)\./);
  if (!missingMatch) {
    return {
      ...normalized,
      instruction: normalized.instruction
        .replace(
          "Use openspec-continue-change to generate the tracking file.",
          `Use ${commandHint(ctx, `instructions tasks --change "${normalized.changeName}" --json`)} to generate the tracking file.`,
        )
        .replace(
          "Add tasks to tasks.md or regenerate it with openspec-continue-change.",
          `Add tasks to tasks.md or regenerate it with ${commandHint(ctx, `instructions tasks --change "${normalized.changeName}" --json`)}.`,
        ),
    };
  }

  const artifacts = missingMatch[1]
    .split(",")
    .map((artifact) => artifact.trim())
    .filter(Boolean);
  const commands = artifacts.map(
    (artifact) => commandHint(ctx, `instructions ${artifact} --change "${normalized.changeName}" --json`),
  );

  return {
    ...normalized,
    instruction: [
      `Cannot apply this change yet. Missing artifacts: ${artifacts.join(", ")}.`,
      "Create the missing artifacts first:",
      ...commands,
    ].join("\n"),
  };
}

async function newChange(ctx, options, positional) {
  const changeId = positional[0];
  if (!changeId) {
    throw new Error("Missing change id");
  }
  ensureValidChangeId(changeId);

  const schemaName = options.schema ?? schemaFromConfig(ctx);
  if (!openspec.getSchemaDir(schemaName, ctx.profileRoot)) {
    throw new Error(`Schema '${schemaName}' not found`);
  }

  const dir = changeDir(ctx, changeId);
  if (fs.existsSync(dir)) {
    throw new Error(`Change '${changeId}' already exists at ${dir}`);
  }

  fs.mkdirSync(dir, { recursive: true });
  const created = new Date().toISOString().slice(0, 10);
  const metadata = {
    schema: schemaName,
    created,
  };
  fs.writeFileSync(path.join(dir, ".openspec.yaml"), stringifyYaml(metadata), "utf8");

  if (options.description) {
    fs.writeFileSync(path.join(dir, "README.md"), `# ${changeId}\n\n${options.description}\n`, "utf8");
  }

  printJson({
    change: {
      id: changeId,
      path: dir,
      metadataPath: path.join(dir, ".openspec.yaml"),
      schema: schemaName,
      targetProjectRoot: ctx.projectRoot,
      workflowRoot,
      profileName: ctx.profileName,
      profileRoot: ctx.profileRoot,
    },
  });
}

async function listChanges(ctx, options) {
  const changes = existingChanges(ctx);
  if (options.json) {
    printJson({ targetProjectRoot: ctx.projectRoot, workflowRoot, profileName: ctx.profileName, profileRoot: ctx.profileRoot, changes });
    return;
  }
  if (changes.length === 0) {
    console.log("No active changes found.");
    return;
  }
  for (const change of changes) {
    const schema = change.schema ? ` (${change.schema})` : "";
    console.log(`- ${change.id}${schema}`);
  }
}

async function status(ctx, options, positional) {
  const changeId = options.change ?? positional[0];
  if (!changeId) {
    throw new Error("Missing change id");
  }
  const context = loadContext(ctx, changeId, options.schema);
  const payload = normalizeStatusPayload(ctx, openspec.formatChangeStatus(context));
  if (options.json) {
    printJson(payload);
    return;
  }
  console.log(`Change: ${payload.changeName}`);
  console.log(`Schema: ${payload.schemaName}`);
  console.log(`Path: ${payload.changeRoot}`);
  for (const artifact of payload.artifacts) {
    console.log(`- ${artifact.status} ${artifact.id}: ${artifact.outputPath}`);
  }
}

async function instructions(ctx, options, positional) {
  const artifactId = positional[0];
  const changeId = options.change;
  if (!artifactId) {
    throw new Error("Missing artifact id");
  }
  if (!changeId) {
    throw new Error("Missing --change <change-id>");
  }

  if (artifactId === "apply") {
    const payload = normalizeApplyPayload(
      ctx,
      await openspec.generateApplyInstructions(ctx.profileRoot, changeId, options.schema, planningHome(ctx)),
    );
    if (options.json) {
      printJson(payload);
      return;
    }
    console.log(`Apply: ${payload.changeName}`);
    console.log(`Schema: ${payload.schemaName}`);
    console.log(`State: ${payload.state}`);
    console.log(`Progress: ${payload.progress.complete}/${payload.progress.total}`);
    console.log(payload.instruction);
    return;
  }

  const context = loadContext(ctx, changeId, options.schema);
  const payload = openspec.generateInstructions(context, artifactId, ctx.profileRoot);
  if (options.json) {
    printJson({ ...payload, targetProjectRoot: ctx.projectRoot, workflowRoot, profileName: ctx.profileName, profileRoot: ctx.profileRoot });
    return;
  }
  console.log(`Artifact: ${payload.artifactId}`);
  console.log(`Change: ${payload.changeName}`);
  console.log(`Write to: ${payload.resolvedOutputPath}`);
  if (payload.context) {
    console.log("\nWorkflow context:\n");
    console.log(payload.context);
  }
  if (payload.rules?.length) {
    console.log("\nRules:");
    for (const rule of payload.rules) {
      console.log(`- ${rule}`);
    }
  }
  console.log("\nTemplate:\n");
  console.log(payload.template.trim());
}

async function archive(ctx, options, positional) {
  const changeId = positional[0] ?? options.change;
  if (!changeId) {
    throw new Error("Missing change id");
  }

  const context = loadContext(ctx, changeId, options.schema);
  const statusPayload = openspec.formatChangeStatus(context);
  const applyPayload = await openspec.generateApplyInstructions(ctx.profileRoot, changeId, options.schema, planningHome(ctx));
  const { archiveCheck, workflowContext } = await importFromRoot("runtime/cli/changeflow.mjs");
  const archiveGate = archiveCheck(workflowContext(ctx.projectRoot), changeId);

  if (!archiveGate.archiveAllowed) {
    const details = archiveGate.findings
      .map((finding) => {
        const extra = finding.files ? ` (${finding.files.join(", ")})` : "";
        return `- ${finding.code}: ${finding.message}${extra}`;
      })
      .join("\n");
    throw new Error(`Archive gate failed:\n${details}`);
  }

  const incompleteArtifacts = statusPayload.artifacts.filter((artifact) => artifact.status !== "done");
  if (incompleteArtifacts.length > 0) {
    throw new Error(`Archive gate failed: incomplete artifacts: ${incompleteArtifacts.map((artifact) => artifact.id).join(", ")}.`);
  }
  if (applyPayload.progress.remaining > 0) {
    throw new Error(`Archive gate failed: incomplete tasks: ${applyPayload.progress.remaining}.`);
  }

  fs.mkdirSync(ctx.archivedDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const target = path.join(ctx.archivedDir, `${today}-${changeId}`);
  if (fs.existsSync(target)) {
    throw new Error(`Archive target already exists: ${target}`);
  }
  fs.renameSync(changeDir(ctx, changeId), target);
  printJson({
    archived: true,
    change: changeId,
    from: changeDir(ctx, changeId),
    to: target,
    targetProjectRoot: ctx.projectRoot,
    workflowRoot,
    profileName: ctx.profileName,
    profileRoot: ctx.profileRoot,
  });
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command, ...commandArgs] = positional;
  if (!command || command === "--help" || command === "-h") {
    usage(0);
  }

  await loadOpenSpec();
  const ctx = targetContext(options);

  switch (command) {
    case "new":
      await newChange(ctx, options, commandArgs);
      break;
    case "list":
      await listChanges(ctx, options);
      break;
    case "status":
      await status(ctx, options, commandArgs);
      break;
    case "instructions":
      await instructions(ctx, options, commandArgs);
      break;
    case "archive":
      await archive(ctx, options, commandArgs);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
