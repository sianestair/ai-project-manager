import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse, stringify } from "yaml";

import { EXIT_CODES, PmError } from "../cli/errors.js";

export async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file error.";
    throw new PmError("file_read_failed", "Unable to read " + path + ".", EXIT_CODES.validation, [
      message,
    ]);
  }
}

export async function readYamlFile(path: string): Promise<unknown> {
  const content = await readTextFile(path);

  try {
    return parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown YAML error.";
    throw new PmError(
      "yaml_parse_failed",
      "Unable to parse YAML file " + path + ".",
      EXIT_CODES.validation,
      [message],
    );
  }
}

export function stringifyYaml(value: unknown): string {
  return stringify(value, {
    lineWidth: 0,
    sortMapEntries: false,
  });
}

export async function writeTextExclusive(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(path, content, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file error.";
    throw new PmError(
      "file_conflict",
      "Refusing to overwrite existing file " + path + ".",
      EXIT_CODES.conflict,
      [message],
    );
  }
}

export async function writeYamlAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = path + ".pm-tmp-" + randomUUID();
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, stringifyYaml(value), {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    const message = error instanceof Error ? error.message : "Unknown file error.";
    throw new PmError(
      "atomic_write_failed",
      "Unable to atomically write " + path + ".",
      EXIT_CODES.internal,
      [message],
    );
  }
}
