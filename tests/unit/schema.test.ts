import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { PmError } from "../../src/core/runtime/cli/errors.js";
import { digestText } from "../../src/core/runtime/materials/digest.js";
import { createInitialChangeState } from "../../src/core/runtime/project/templates.js";
import {
  validateChangeState,
  validateKnowledgePatch,
  validateProjectConfig,
} from "../../src/core/runtime/state/schema.js";

test("project schema accepts the fixed first-version contract", async () => {
  const project = await validateProjectConfig({
    schema_version: 1,
    project_id: "example-project",
  });

  assert.equal(project.project_id, "example-project");
});

test("project schema rejects an unsupported schema version", async () => {
  await assert.rejects(
    validateProjectConfig({
      schema_version: 2,
      project_id: "example-project",
    }),
    (error: unknown) =>
      error instanceof PmError && error.code === "project_schema_invalid" && error.exitCode === 3,
  );
});

test("change schema accepts the complete initial state", async () => {
  const change = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-14T00:00:00.000Z",
    projectRevision: null,
  });

  const validated = await validateChangeState(change);
  assert.equal(validated.phase, "requirements");
  assert.equal(validated.review.max_iterations, 3);
});

test("change schema rejects illegal enums and missing required material groups", async () => {
  const invalid = structuredClone(
    createInitialChangeState({
      changeId: "wallet-login",
      title: "连接钱包登录",
      capturedAt: "2026-07-14T00:00:00.000Z",
      projectRevision: null,
    }),
  ) as unknown as Record<string, unknown>;

  invalid.phase = "unknown";
  delete invalid.materials;

  await assert.rejects(
    validateChangeState(invalid),
    (error: unknown) =>
      error instanceof PmError &&
      error.code === "change_schema_invalid" &&
      error.details.length >= 2,
  );
});

test("change schema rejects malformed readiness, blocker, and review state", async () => {
  const invalid = structuredClone(
    createInitialChangeState({
      changeId: "wallet-login",
      title: "连接钱包登录",
      capturedAt: "2026-07-14T00:00:00.000Z",
      projectRevision: null,
    }),
  ) as unknown as Record<string, unknown>;

  invalid.readiness = {
    status: "ready",
    assessed_artifacts: [],
    concerns: [],
    assessed_at: null,
  };
  invalid.blockers = [{}];
  invalid.review = {
    iteration: 0,
    max_iterations: 0,
    last_outcome: null,
  };

  await assert.rejects(
    validateChangeState(invalid),
    (error: unknown) =>
      error instanceof PmError &&
      error.code === "change_schema_invalid" &&
      error.details.length >= 3,
  );
});

test("change schema fixes blocker responsibility and review outcome enums", async () => {
  const invalid = structuredClone(
    createInitialChangeState({
      changeId: "wallet-login",
      title: "连接钱包登录",
      capturedAt: "2026-07-15T00:00:00.000Z",
      projectRevision: null,
    }),
  ) as unknown as Record<string, unknown>;

  invalid.blockers = [
    {
      reason: "fixture",
      blocked_by: "unknown-system",
      resume_when: "Fixture condition.",
      affected_stage: "implementation",
      created_at: "2026-07-15T00:00:00.000Z",
      status: "open",
    },
  ];
  invalid.review = {
    iteration: 1,
    max_iterations: 3,
    last_outcome: "arbitrary prose",
  };

  await assert.rejects(
    validateChangeState(invalid),
    (error: unknown) =>
      error instanceof PmError &&
      error.code === "change_schema_invalid" &&
      error.details.length >= 2,
  );
});

test("knowledge patch schema accepts a versioned exact-image envelope", async () => {
  const afterImage = "# Durable rule\n\nApply all targets atomically.\n";
  const patch = await validateKnowledgePatch({
    schema_version: 1,
    change_id: "wallet-login",
    candidate_digest: digestText("knowledge candidates"),
    targets: [
      {
        knowledge_id: "KNOW-001",
        path: "knowledge-base/rules/wallet/login.md",
        operation: "create",
        before_digest: "absent",
        after_digest: digestText(afterImage),
        before_image: null,
        after_image: afterImage,
      },
    ],
  });

  assert.equal(patch.schema_version, 1);
  assert.equal(patch.targets[0]?.operation, "create");
});

test("knowledge patch schema rejects unknown operations and incomplete targets", async () => {
  await assert.rejects(
    validateKnowledgePatch({
      schema_version: 1,
      change_id: "wallet-login",
      candidate_digest: digestText("knowledge candidates"),
      targets: [
        {
          knowledge_id: "KNOW-001",
          path: "knowledge-base/rules/wallet/login.md",
          operation: "merge",
          before_digest: "absent",
        },
      ],
    }),
    (error: unknown) =>
      error instanceof PmError &&
      error.code === "knowledge_patch_schema_invalid" &&
      error.exitCode === 3,
  );
});
