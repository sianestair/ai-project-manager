import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { validateChangeState } from "../state/schema.js";
import { getGitRevision } from "./git.js";
import { stringifyYaml, writeTextExclusive } from "./io.js";
import {
  createInitialChangeState,
  deliveryReadmeTemplate,
  designReadmeTemplate,
  knowledgeUpdateTemplate,
  requirementsTemplate,
} from "./templates.js";

const CHANGE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function startChange(input: {
  projectRoot: string;
  changeId: string;
  title?: string;
  now?: Date;
}): Promise<{
  changeId: string;
  changeDirectory: string;
}> {
  if (!CHANGE_ID_PATTERN.test(input.changeId)) {
    throw new PmError(
      "change_id_invalid",
      "Change id must be a lowercase slug up to 64 characters.",
      EXIT_CODES.usage,
    );
  }

  const title =
    input.title?.trim() === "" || input.title === undefined ? input.changeId : input.title.trim();
  const activeRoot = join(input.projectRoot, "changes", "active");
  const archivedRoot = join(input.projectRoot, "changes", "archived");
  const destination = join(activeRoot, input.changeId);
  const archived = join(archivedRoot, input.changeId);

  await Promise.all([
    mkdir(activeRoot, { recursive: true }),
    mkdir(archivedRoot, { recursive: true }),
  ]);

  if ((await pathExists(destination)) || (await pathExists(archived))) {
    throw new PmError(
      "change_id_conflict",
      "Change id already exists in active or archived history: " + input.changeId,
      EXIT_CODES.conflict,
    );
  }

  const staging = join(activeRoot, ".pm-create-" + input.changeId + "-" + randomUUID());
  const capturedAt = (input.now ?? new Date()).toISOString();
  const state = createInitialChangeState({
    changeId: input.changeId,
    title,
    capturedAt,
    projectRevision: getGitRevision(input.projectRoot),
  });

  await validateChangeState(state);

  try {
    await Promise.all([
      mkdir(join(staging, "design"), { recursive: true }),
      mkdir(join(staging, "delivery"), { recursive: true }),
    ]);
    await Promise.all([
      writeTextExclusive(join(staging, "change.yaml"), stringifyYaml(state)),
      writeTextExclusive(join(staging, "requirements.md"), requirementsTemplate(title)),
      writeTextExclusive(join(staging, "design", "README.md"), designReadmeTemplate(title)),
      writeTextExclusive(join(staging, "delivery", "README.md"), deliveryReadmeTemplate(title)),
      writeTextExclusive(join(staging, "knowledge-update.md"), knowledgeUpdateTemplate(title)),
    ]);
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  return {
    changeId: input.changeId,
    changeDirectory: destination,
  };
}
