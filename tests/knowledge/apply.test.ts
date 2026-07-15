import assert from "node:assert/strict";
import { access, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test } from "vite-plus/test";

import { PmError } from "../../src/core/runtime/cli/errors.js";
import { confirmChange } from "../../src/core/runtime/operations/confirm.js";
import {
  applyKnowledge,
  recoverKnowledgeTransaction,
} from "../../src/core/runtime/operations/knowledge-apply.js";
import { previewKnowledge } from "../../src/core/runtime/operations/knowledge-preview.js";
import { SimulatedInterruption } from "../../src/core/runtime/operations/transaction.js";
import { resolveCanonicalState } from "../../src/core/runtime/state/resolver.js";
import { createKnowledgeProject, readText } from "../helpers/knowledge-project.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareConfirmedKnowledge(projectRoot: string, changeId: string): Promise<void> {
  await previewKnowledge({ project: projectRoot, changeId });
  await confirmChange({
    project: projectRoot,
    changeId,
    gate: "knowledge",
    confirmedBy: "user",
    summary: "Confirmed exact knowledge patch.",
    evidence: "Explicit fixture confirmation.",
  });
}

test("a before-digest conflict changes zero patch targets and returns conflict semantics", async () => {
  const fixture = await createKnowledgeProject("knowledge-conflict");
  try {
    await prepareConfirmedKnowledge(fixture.projectRoot, "knowledge-conflict");
    await writeFile(fixture.currentFactPath, "# Current fact\n\nConcurrent project truth.\n");
    await assert.rejects(
      applyKnowledge({ project: fixture.projectRoot, changeId: "knowledge-conflict" }),
      (error: unknown) =>
        error instanceof PmError &&
        error.code === "knowledge_before_digest_conflict" &&
        error.exitCode === 5,
    );
    assert.equal(
      await readText(fixture.currentFactPath),
      "# Current fact\n\nConcurrent project truth.\n",
    );
    assert.equal(await exists(fixture.newRulePath), false);
    assert.equal(await readText(fixture.obsoleteDecisionPath), fixture.obsoleteDecision);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

for (const boundary of [0, 1, 2]) {
  test(
    "an interruption after target " + String(boundary + 1) + " can restore every before-image",
    async () => {
      const changeId = "knowledge-rollback-" + String(boundary + 1);
      const fixture = await createKnowledgeProject(changeId);
      try {
        await prepareConfirmedKnowledge(fixture.projectRoot, changeId);
        await assert.rejects(
          applyKnowledge(
            { project: fixture.projectRoot, changeId },
            {
              afterTargetWrite(index) {
                if (index === boundary) {
                  throw new SimulatedInterruption();
                }
              },
            },
          ),
          SimulatedInterruption,
        );
        const interrupted = await resolveCanonicalState({
          project: fixture.projectRoot,
          changeId,
        });
        assert.equal(interrupted.transaction.status, "pending");
        assert.deepEqual(
          interrupted.available_actions.map((action) => action.id),
          ["recover_transaction"],
        );

        await recoverKnowledgeTransaction({
          project: fixture.projectRoot,
          changeId,
          strategy: "rollback",
        });
        assert.equal(await readText(fixture.currentFactPath), fixture.originalFact);
        assert.equal(await exists(fixture.newRulePath), false);
        assert.equal(await readText(fixture.obsoleteDecisionPath), fixture.obsoleteDecision);
        const recovered = await resolveCanonicalState({
          project: fixture.projectRoot,
          changeId,
        });
        assert.equal(recovered.transaction.status, "none");
        assert.equal(recovered.change.phase, "knowledge");
        assert.equal(recovered.next_action.action, "apply_knowledge");
      } finally {
        await rm(fixture.projectRoot, { recursive: true, force: true });
      }
    },
  );
}

test("a third-party after-image mismatch remains recoverable and blocks verification", async () => {
  const changeId = "knowledge-after-mismatch";
  const fixture = await createKnowledgeProject(changeId);
  try {
    await prepareConfirmedKnowledge(fixture.projectRoot, changeId);
    await assert.rejects(
      applyKnowledge(
        { project: fixture.projectRoot, changeId },
        {
          async afterTargetWrite(index) {
            if (index === 2) {
              await writeFile(fixture.currentFactPath, "# Third-party value\n");
            }
          },
        },
      ),
      (error: unknown) =>
        error instanceof PmError &&
        error.code === "transaction_target_conflict" &&
        error.exitCode === 5,
    );
    const interrupted = await resolveCanonicalState({
      project: fixture.projectRoot,
      changeId,
    });
    assert.equal(interrupted.knowledge_promotion.verified, false);
    assert.equal(interrupted.archive_readiness.ready, false);
    assert.equal(interrupted.transaction.status, "pending");
    assert.equal(await readText(fixture.currentFactPath), "# Third-party value\n");
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("an interrupted apply can commit all post-images and reach archive readiness", async () => {
  const fixture = await createKnowledgeProject("knowledge-commit");
  try {
    await prepareConfirmedKnowledge(fixture.projectRoot, "knowledge-commit");
    await assert.rejects(
      applyKnowledge(
        { project: fixture.projectRoot, changeId: "knowledge-commit" },
        {
          beforeStateWrite() {
            throw new SimulatedInterruption();
          },
        },
      ),
      SimulatedInterruption,
    );
    const result = await recoverKnowledgeTransaction({
      project: fixture.projectRoot,
      changeId: "knowledge-commit",
      strategy: "commit",
    });
    assert.equal(result.phase, "archive_ready");
    assert.equal(await readText(fixture.currentFactPath), fixture.replacementFact);
    assert.equal(await readText(fixture.newRulePath), fixture.newRule);
    assert.equal(await exists(fixture.obsoleteDecisionPath), false);
    const state = await resolveCanonicalState({
      project: fixture.projectRoot,
      changeId: "knowledge-commit",
    });
    assert.equal(state.knowledge_promotion.verified, true);
    assert.equal(state.archive_readiness.ready, true);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("an explicitly confirmed no-knowledge-change conclusion reaches archive readiness without a patch", async () => {
  const fixture = await createKnowledgeProject("knowledge-no-change");
  try {
    await writeFile(
      join(fixture.changeRoot, "knowledge-update.md"),
      [
        "# No knowledge change",
        "",
        "## 候选知识",
        "",
        "无知识变更",
        "",
        "## 用户处理结果",
        "",
        "明确确认没有长期知识需要提升。",
        "",
        "## 知识门前自检",
        "",
        "知识类型、长期有效性和实现细节排除项均已检查。",
        "",
      ].join("\n"),
    );
    const preview = await previewKnowledge({
      project: fixture.projectRoot,
      changeId: "knowledge-no-change",
    });
    assert.equal(preview.noChange, true);
    assert.equal(preview.patchDigest, null);
    assert.equal(await exists(join(fixture.changeRoot, "knowledge.patch")), false);
    await confirmChange({
      project: fixture.projectRoot,
      changeId: "knowledge-no-change",
      gate: "knowledge",
      confirmedBy: "user",
      summary: "Confirmed no knowledge change.",
      evidence: "Explicit fixture confirmation.",
    });
    const result = await applyKnowledge({
      project: fixture.projectRoot,
      changeId: "knowledge-no-change",
    });
    assert.equal(result.noChange, true);
    assert.equal(result.phase, "archive_ready");
    assert.equal(await readText(fixture.currentFactPath), fixture.originalFact);
    assert.equal(await exists(fixture.newRulePath), false);
    assert.equal(await readText(fixture.obsoleteDecisionPath), fixture.obsoleteDecision);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("recovery after the terminal state write only cleans the completed transaction", async () => {
  const fixture = await createKnowledgeProject("knowledge-state-recovery");
  try {
    await prepareConfirmedKnowledge(fixture.projectRoot, "knowledge-state-recovery");
    await assert.rejects(
      applyKnowledge(
        { project: fixture.projectRoot, changeId: "knowledge-state-recovery" },
        {
          afterStateWrite() {
            throw new SimulatedInterruption();
          },
        },
      ),
      SimulatedInterruption,
    );
    const interrupted = await resolveCanonicalState({
      project: fixture.projectRoot,
      changeId: "knowledge-state-recovery",
    });
    assert.equal(interrupted.knowledge_promotion.verified, true);
    assert.equal(interrupted.transaction.status, "pending");
    const recovered = await recoverKnowledgeTransaction({
      project: fixture.projectRoot,
      changeId: "knowledge-state-recovery",
      strategy: "commit",
    });
    assert.equal(recovered.phase, "archive_ready");
    const finalState = await resolveCanonicalState({
      project: fixture.projectRoot,
      changeId: "knowledge-state-recovery",
    });
    assert.equal(finalState.transaction.status, "none");
    assert.equal(finalState.archive_readiness.ready, true);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});
