import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "vite-plus/test";

import { resolveArtifactIndex } from "../../src/core/runtime/materials/markdown-contract.js";
import type { MaterialSetName, ResolvedMaterialSet } from "../../src/core/runtime/state/types.js";

function material(name: MaterialSetName, paths: string[]): ResolvedMaterialSet {
  return {
    name,
    artifacts: paths.map((path) => ({ path, digest: "a".repeat(64) })),
    digest: "b".repeat(64),
  };
}

test("Markdown contract indexes fixed records while ignoring fenced examples", async () => {
  const root = await mkdtemp(join(tmpdir(), "pm-markdown-contract-"));
  try {
    await mkdir(join(root, "design"), { recursive: true });
    await mkdir(join(root, "delivery"), { recursive: true });
    await writeFile(
      join(root, "requirements.md"),
      [
        "```md",
        "### REQ-EXAMPLE: ignored",
        "```",
        "### REQ-001: Real requirement",
        "- 说明：real",
        "### AC-001: Observable result",
        "- 追溯：REQ-001",
      ].join("\n"),
    );
    await writeFile(
      join(root, "design", "README.md"),
      "### DES-001: Decision\n- 追溯：REQ-001, AC-001\n",
    );
    await writeFile(
      join(root, "delivery", "README.md"),
      "### REQ-001: Wrong duplicate placement\n",
    );

    const result = await resolveArtifactIndex(root, {
      requirements: material("requirements", ["requirements.md"]),
      design: material("design", ["design/README.md"]),
      delivery: material("delivery", ["delivery/README.md"]),
      knowledge: material("knowledge", []),
    });

    assert.deepEqual(
      result.index.records.map((record) => record.id),
      ["AC-001", "DES-001", "REQ-001", "REQ-001"],
    );
    assert.equal(
      result.index.records.some((record) => record.id === "REQ-EXAMPLE"),
      false,
    );
    assert.equal(
      result.diagnostics.some((item) => item.code === "artifact_id_duplicate"),
      true,
    );
    assert.equal(
      result.diagnostics.some((item) => item.code === "artifact_material_mismatch"),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
