import { access, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import type { ProjectConfig } from "../state/types.js";
import { validateProjectConfig } from "../state/schema.js";
import { readYamlFile, stringifyYaml, writeTextExclusive } from "./io.js";
import { agentsTemplate, knowledgeReadmeTemplate } from "./templates.js";

const PROJECT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function inferProjectId(projectRoot: string): string {
  const inferred = basename(projectRoot)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  if (!PROJECT_ID_PATTERN.test(inferred)) {
    throw new PmError(
      "project_id_required",
      "Unable to infer a valid project id; provide --project-id.",
      EXIT_CODES.usage,
    );
  }

  return inferred;
}

async function ensureDirectoryContract(projectRoot: string): Promise<void> {
  const directories = [
    "knowledge-base/facts",
    "knowledge-base/rules",
    "knowledge-base/decisions",
    "engineering",
    "changes/active",
    "changes/archived",
  ];

  await Promise.all(
    directories.map((path) =>
      mkdir(join(projectRoot, path), {
        recursive: true,
      }),
    ),
  );
}

async function ensureManagedFile(path: string, content: string): Promise<boolean> {
  if (await pathExists(path)) {
    return false;
  }

  await writeTextExclusive(path, content);
  return true;
}

export async function initializeProject(input: {
  projectRoot: string;
  projectId?: string;
}): Promise<{
  projectRoot: string;
  projectId: string;
  created: boolean;
}> {
  const projectRoot = resolve(input.projectRoot);
  await mkdir(projectRoot, { recursive: true });

  const projectPath = join(projectRoot, "PROJECT.yaml");
  const agentsPath = join(projectRoot, "AGENTS.md");
  const knowledgeReadmePath = join(projectRoot, "knowledge-base", "README.md");

  if (await pathExists(projectPath)) {
    const existing = await validateProjectConfig(await readYamlFile(projectPath));
    if (input.projectId !== undefined && existing.project_id !== input.projectId) {
      throw new PmError(
        "project_id_conflict",
        "Existing PROJECT.yaml uses project_id " + existing.project_id + ".",
        EXIT_CODES.conflict,
      );
    }

    await ensureDirectoryContract(projectRoot);
    const createdFiles = await Promise.all([
      ensureManagedFile(agentsPath, agentsTemplate()),
      ensureManagedFile(knowledgeReadmePath, knowledgeReadmeTemplate()),
    ]);

    return {
      projectRoot,
      projectId: existing.project_id,
      created: createdFiles.some(Boolean),
    };
  }

  const requestedId = input.projectId ?? inferProjectId(projectRoot);

  if (!PROJECT_ID_PATTERN.test(requestedId)) {
    throw new PmError(
      "project_id_invalid",
      "Project id must be a lowercase slug up to 64 characters.",
      EXIT_CODES.usage,
    );
  }

  const conflicts = [];
  for (const path of [agentsPath, knowledgeReadmePath]) {
    if (await pathExists(path)) {
      conflicts.push(path);
    }
  }

  if (conflicts.length > 0) {
    throw new PmError(
      "initialization_conflict",
      "Managed files already exist without PROJECT.yaml; refusing to overwrite.",
      EXIT_CODES.conflict,
      conflicts,
    );
  }

  await ensureDirectoryContract(projectRoot);
  const config: ProjectConfig = {
    schema_version: 1,
    project_id: requestedId,
  };
  await validateProjectConfig(config);

  await writeTextExclusive(projectPath, stringifyYaml(config));
  await writeTextExclusive(agentsPath, agentsTemplate());
  await writeTextExclusive(knowledgeReadmePath, knowledgeReadmeTemplate());

  return {
    projectRoot,
    projectId: requestedId,
    created: true,
  };
}
