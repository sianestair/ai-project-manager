import { readFile } from "node:fs/promises";

import type {
  ChangeState,
  Diagnostic,
  MaterialSetName,
  ResolvedMaterialSet,
} from "../state/types.js";
import { digestArtifactSet, digestFile } from "./digest.js";
import { normalizeRelativePath, resolveExistingFile } from "./paths.js";

const MATERIAL_NAMES: readonly MaterialSetName[] = [
  "requirements",
  "design",
  "delivery",
  "knowledge",
];

function diagnostic(code: string, path: string, message: string): Diagnostic {
  return {
    severity: "error",
    code,
    path,
    message,
  };
}

function extractMaterialIndex(content: string): string[] {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const result: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.trim() === "## 材料清单") {
      inSection = true;
      continue;
    }

    if (inSection && line.startsWith("#")) {
      break;
    }

    if (inSection) {
      const match = /^-\s+`([^`]+)`\s*$/.exec(line.trim());
      if (match?.[1] !== undefined) {
        result.push(normalizeRelativePath(match[1]));
      }
    }
  }

  return result;
}

async function validateIndexedSet(
  changeDirectory: string,
  name: "design" | "delivery",
  expected: readonly string[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const indexPath = name + "/README.md";

  try {
    const fullPath = await resolveExistingFile(changeDirectory, indexPath);
    const content = await readFile(fullPath, "utf8");
    const actual = extractMaterialIndex(content).sort();
    const canonicalExpected = [...expected].sort();

    if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
      diagnostics.push(
        diagnostic(
          "material_index_mismatch",
          indexPath,
          indexPath + " material list does not match change.yaml.materials." + name + ".",
        ),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown material index error.";
    diagnostics.push(diagnostic("material_index_unreadable", indexPath, message));
  }
}

export async function resolveMaterialSets(
  changeDirectory: string,
  state: ChangeState,
): Promise<{
  materials: Record<MaterialSetName, ResolvedMaterialSet>;
  diagnostics: Diagnostic[];
}> {
  const entries = await Promise.all(
    MATERIAL_NAMES.map(async (name) => {
      const diagnostics: Diagnostic[] = [];
      const configured = state.materials[name];
      const combined = [...configured.required, ...configured.included];
      const normalized: string[] = [];

      for (const path of combined) {
        try {
          const canonicalPath = normalizeRelativePath(path);
          if (canonicalPath !== path) {
            diagnostics.push(
              diagnostic(
                "material_path_not_canonical",
                "materials." + name,
                "Material paths must use canonical POSIX form: " + path,
              ),
            );
          }
          normalized.push(canonicalPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown path error.";
          diagnostics.push(diagnostic("unsafe_material_path", "materials." + name, message));
        }
      }

      const unique = [...new Set(normalized)];
      if (unique.length !== normalized.length) {
        diagnostics.push(
          diagnostic(
            "duplicate_material",
            "materials." + name,
            "Required and included material paths must be unique as one set.",
          ),
        );
      }

      const artifacts = [];
      for (const path of unique) {
        try {
          const fullPath = await resolveExistingFile(changeDirectory, path);
          artifacts.push({
            path,
            digest: await digestFile(fullPath),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown material error.";
          diagnostics.push(diagnostic("material_unavailable", path, message));
        }
      }

      if (name === "design" || name === "delivery") {
        await validateIndexedSet(changeDirectory, name, unique, diagnostics);
      }

      const resolved: ResolvedMaterialSet = {
        name,
        artifacts,
        digest: artifacts.length === unique.length ? digestArtifactSet(artifacts) : null,
      };

      return [name, resolved, diagnostics] as const;
    }),
  );

  return {
    materials: Object.fromEntries(entries.map(([name, material]) => [name, material])) as Record<
      MaterialSetName,
      ResolvedMaterialSet
    >,
    diagnostics: entries.flatMap((entry) => entry[2]),
  };
}
