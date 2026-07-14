import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageMetadata {
  name: string;
  version: string;
}

let cachedRoot: string | undefined;

export function getPackageRoot(): string {
  if (cachedRoot !== undefined) {
    return cachedRoot;
  }

  let current = dirname(fileURLToPath(import.meta.url));
  const filesystemRoot = parse(current).root;

  while (true) {
    if (existsSync(join(current, "package.json"))) {
      cachedRoot = current;
      return current;
    }

    if (current === filesystemRoot) {
      throw new Error("Unable to locate ai-project-manager package root.");
    }

    current = dirname(current);
  }
}

export function getPackageMetadata(): PackageMetadata {
  const content = readFileSync(join(getPackageRoot(), "package.json"), "utf8");
  const parsed: unknown = JSON.parse(content);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("name" in parsed) ||
    !("version" in parsed) ||
    typeof parsed.name !== "string" ||
    typeof parsed.version !== "string"
  ) {
    throw new Error("Invalid package metadata.");
  }

  return {
    name: parsed.name,
    version: parsed.version,
  };
}
