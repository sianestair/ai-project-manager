import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import changeSchema from "../../schemas/change.schema.json" with { type: "json" };
import projectSchema from "../../schemas/project.schema.json" with { type: "json" };
import { EXIT_CODES, PmError } from "../cli/errors.js";
import type { ChangeState, ProjectConfig } from "./types.js";

const ajv = new Ajv({
  allErrors: true,
  strict: true,
});

let projectValidator: ValidateFunction | undefined;
let changeValidator: ValidateFunction | undefined;

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath === "" ? "/" : error.instancePath;
    return path + " " + (error.message ?? "is invalid");
  });
}

async function loadValidator(name: "project" | "change"): Promise<ValidateFunction> {
  const existing = name === "project" ? projectValidator : changeValidator;
  if (existing !== undefined) {
    return existing;
  }

  const schema = name === "project" ? projectSchema : changeSchema;
  const validator = ajv.compile(schema);

  if (name === "project") {
    projectValidator = validator;
  } else {
    changeValidator = validator;
  }

  return validator;
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
