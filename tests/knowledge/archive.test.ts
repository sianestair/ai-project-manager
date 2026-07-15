import assert from "node:assert/strict";
import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { test } from "vite-plus/test";

import { PmError } from "../../src/core/runtime/cli/errors.js";
import {
  archiveChange,
  checkArchive,
  SimulatedArchiveInterruption,
} from "../../src/core/runtime/operations/archive.js";
import { confirmChange } from "../../src/core/runtime/operations/confirm.js";
import { applyKnowledge } from "../../src/core/runtime/operations/knowledge-apply.js";
import { previewKnowledge } from "../../src/core/runtime/operations/knowledge-preview.js";
import { resolveCanonicalState } from "../../src/core/runtime/state/resolver.js";
import { createKnowledgeProject } from "../helpers/knowledge-project.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareArchive(projectRoot: string, changeId: string): Promise<void> {
  await previewKnowledge({ project: projectRoot, changeId });
  await confirmChange({
    project: projectRoot,
    changeId,
    gate: "knowledge",
    confirmedBy: "user",
    summary: "Confirmed exact knowledge patch.",
    evidence: "Explicit fixture confirmation.",
  });
  await applyKnowledge({ project: projectRoot, changeId });
}

test("archive recovery completes an interrupted rename and archived validation remains self-contained", async () => {
  const fixture = await createKnowledgeProject("archive-recovery");
  try {
    await prepareArchive(fixture.projectRoot, "archive-recovery");
    assert.deepEqual(
      await checkArchive({ project: fixture.projectRoot, changeId: "archive-recovery" }),
      {
        changeId: "archive-recovery",
        ready: true,
        unmetConditions: [],
      },
    );
    await assert.rejects(
      archiveChange(
        { project: fixture.projectRoot, changeId: "archive-recovery" },
        {
          afterRename() {
            throw new SimulatedArchiveInterruption();
          },
        },
      ),
      SimulatedArchiveInterruption,
    );
    assert.equal(
      await exists(join(fixture.projectRoot, "changes", "archived", "archive-recovery")),
      true,
    );

    const result = await archiveChange({
      project: fixture.projectRoot,
      changeId: "archive-recovery",
    });
    assert.equal(result.recovered, true);
    assert.equal(
      await exists(join(fixture.projectRoot, "changes", "active", "archive-recovery")),
      false,
    );
    const archived = await resolveCanonicalState({
      project: fixture.projectRoot,
      changeId: "archive-recovery",
      allowArchived: true,
    });
    assert.equal(archived.change.location, "archived");
    assert.equal(archived.change.phase, "archived");
    assert.equal(archived.change.status, "completed");
    assert.equal(archived.next_action.valid, true);
    assert.deepEqual(
      archived.available_actions.map((action) => action.id),
      ["inspect_archive"],
    );
    assert.equal(
      archived.diagnostics.some((item) => item.severity === "error"),
      false,
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("an existing archived destination blocks archive without moving the active Change", async () => {
  const fixture = await createKnowledgeProject("archive-conflict");
  try {
    await prepareArchive(fixture.projectRoot, "archive-conflict");
    await mkdir(join(fixture.projectRoot, "changes", "archived", "archive-conflict"));
    await assert.rejects(
      archiveChange({ project: fixture.projectRoot, changeId: "archive-conflict" }),
      (error: unknown) => error instanceof PmError && error.exitCode === 5,
    );
    assert.equal(
      await exists(join(fixture.projectRoot, "changes", "active", "archive-conflict")),
      true,
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("a cross-device rename failure preserves a recoverable active Change", async () => {
  const changeId = "archive-cross-device";
  const fixture = await createKnowledgeProject(changeId);
  try {
    await prepareArchive(fixture.projectRoot, changeId);
    await assert.rejects(
      archiveChange(
        { project: fixture.projectRoot, changeId },
        {
          async renameDirectory() {
            const error = new Error("Cross-device link not permitted") as NodeJS.ErrnoException;
            error.code = "EXDEV";
            throw error;
          },
        },
      ),
      (error: unknown) =>
        error instanceof Error && (error as NodeJS.ErrnoException).code === "EXDEV",
    );
    assert.equal(await exists(fixture.changeRoot), true);
    assert.equal(await exists(join(fixture.projectRoot, "changes", "archived", changeId)), false);

    const recovered = await archiveChange({ project: fixture.projectRoot, changeId });
    assert.equal(recovered.recovered, true);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("an ordinary post-rename failure rolls the directory back before retry", async () => {
  const changeId = "archive-rename-rollback";
  const fixture = await createKnowledgeProject(changeId);
  try {
    await prepareArchive(fixture.projectRoot, changeId);
    await assert.rejects(
      archiveChange(
        { project: fixture.projectRoot, changeId },
        {
          afterRename() {
            throw new Error("Injected failure after rename.");
          },
        },
      ),
      /Injected failure after rename/u,
    );
    assert.equal(await exists(fixture.changeRoot), true);
    assert.equal(await exists(join(fixture.projectRoot, "changes", "archived", changeId)), false);

    const recovered = await archiveChange({ project: fixture.projectRoot, changeId });
    assert.equal(recovered.recovered, true);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

for (const boundary of ["marker", "terminal"] as const) {
  test("archive recovers an interruption after " + boundary, async () => {
    const changeId = "archive-" + boundary;
    const fixture = await createKnowledgeProject(changeId);
    try {
      await prepareArchive(fixture.projectRoot, changeId);
      await assert.rejects(
        archiveChange(
          { project: fixture.projectRoot, changeId },
          boundary === "marker"
            ? {
                afterMarkerWrite() {
                  throw new SimulatedArchiveInterruption();
                },
              }
            : {
                afterTerminalWrite() {
                  throw new SimulatedArchiveInterruption();
                },
              },
        ),
        SimulatedArchiveInterruption,
      );
      const recovered = await archiveChange({ project: fixture.projectRoot, changeId });
      assert.equal(recovered.recovered, true);
      const archived = await resolveCanonicalState({
        project: fixture.projectRoot,
        changeId,
        allowArchived: true,
      });
      assert.equal(archived.change.phase, "archived");
      assert.equal(
        archived.diagnostics.some((item) => item.severity === "error"),
        false,
      );
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
    }
  });
}
