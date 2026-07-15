import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import changeSchema from "../../schemas/change.schema.json" with { type: "json" };
import knowledgePatchSchema from "../../schemas/knowledge-patch.schema.json" with { type: "json" };
import projectSchema from "../../schemas/project.schema.json" with { type: "json" };
import { EXIT_CODES, PmError } from "../cli/errors.js";
import type { ChangeState, KnowledgePatchEnvelope, ProjectConfig } from "./types.js";

const ajv = new Ajv({
  allErrors: true,
  strict: true,
});

let projectValidator: ValidateFunction | undefined;
let changeValidator: ValidateFunction | undefined;
let knowledgePatchValidator: ValidateFunction | undefined;

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath === "" ? "/" : error.instancePath;
    return path + " " + (error.message ?? "is invalid");
  });
}

async function loadValidator(
  name: "project" | "change" | "knowledge_patch",
): Promise<ValidateFunction> {
  const existing =
    name === "project"
      ? projectValidator
      : name === "change"
        ? changeValidator
        : knowledgePatchValidator;
  if (existing !== undefined) {
    return existing;
  }

  const schema =
    name === "project" ? projectSchema : name === "change" ? changeSchema : knowledgePatchSchema;
  const validator = ajv.compile(schema);

  if (name === "project") {
    projectValidator = validator;
  } else if (name === "change") {
    changeValidator = validator;
  } else {
    knowledgePatchValidator = validator;
  }

  return validator;
}

export async function validateKnowledgePatch(value: unknown): Promise<KnowledgePatchEnvelope> {
  const validate = await loadValidator("knowledge_patch");
  if (!validate(value)) {
    throw new PmError(
      "knowledge_patch_schema_invalid",
      "knowledge.patch does not satisfy knowledge-patch.schema.json.",
      EXIT_CODES.validation,
      formatSchemaErrors(validate.errors),
    );
  }

  return value as KnowledgePatchEnvelope;
}

export async function validateProjectConfig(value: unknown): Promise<ProjectConfig> {
  const validate = await loadValidator("project");
  if (!validate(value)) {
    throw new PmError(
      "project_schema_invalid",
      "PROJECT.yaml does not satisfy project.schema.json.",
      EXIT_CODES.validation,
      formatSchemaErrors(validate.errors),
    );
  }

  return value as ProjectConfig;
}

export async function validateChangeState(value: unknown): Promise<ChangeState> {
  const validate = await loadValidator("change");
  if (!validate(value)) {
    throw new PmError(
      "change_schema_invalid",
      "change.yaml does not satisfy change.schema.json.",
      EXIT_CODES.validation,
      formatSchemaErrors(validate.errors),
    );
  }

  return value as ChangeState;
}
