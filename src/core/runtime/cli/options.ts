import { EXIT_CODES, PmError } from "./errors.js";

export type CommandOptionValues = Record<string, unknown>;

export interface ProjectCommandOptions {
  project?: string;
  json: boolean;
}

export function readCommandOptions(value: unknown): CommandOptionValues {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PmError("invalid_arguments", "Command options must be an object.", EXIT_CODES.usage);
  }

  return value as CommandOptionValues;
}

export function readOptionalStringOption(
  options: CommandOptionValues,
  property: string,
  flag = property,
): string | undefined {
  const value = options[property];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new PmError(
      "invalid_arguments",
      "Expected a string value for --" + flag + ".",
      EXIT_CODES.usage,
    );
  }

  return value;
}

export function readBooleanOption(
  options: CommandOptionValues,
  property: string,
  flag = property,
): boolean {
  const value = options[property];
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new PmError(
      "invalid_arguments",
      "Expected a boolean value for --" + flag + ".",
      EXIT_CODES.usage,
    );
  }

  return value;
}

export function readProjectCommandOptions(value: unknown): ProjectCommandOptions {
  const options = readCommandOptions(value);
  const project = readOptionalStringOption(options, "project");

  return {
    ...(project === undefined ? {} : { project }),
    json: readBooleanOption(options, "json"),
  };
}
