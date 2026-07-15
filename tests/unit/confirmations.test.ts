import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import {
  appendConfirmation,
  confirmationAuthorityReason,
  resolveConfirmations,
} from "../../src/core/runtime/governance/confirmations.js";
import { createInitialChangeState } from "../../src/core/runtime/project/templates.js";
import type {
  DesignPermissionFact,
  MaterialSetName,
  ResolvedMaterialSet,
  ResolvedReadiness,
} from "../../src/core/runtime/state/types.js";

const FIRST_DIGEST = "a".repeat(64);
const SECOND_DIGEST = "b".repeat(64);

function materials(requirementsDigest = FIRST_DIGEST) {
  const paths: Record<MaterialSetName, string> = {
    requirements: "requirements.md",
    design: "design/README.md",
    delivery: "delivery/README.md",
    knowledge: "knowledge-update.md",
  };

  return Object.fromEntries(
    (Object.entries(paths) as Array<[MaterialSetName, string]>).map(([name, path]) => [
      name,
      {
        name,
        artifacts: [{ path, digest: name === "requirements" ? requirementsDigest : FIRST_DIGEST }],
        digest: name === "requirements" ? requirementsDigest : FIRST_DIGEST,
      } satisfies ResolvedMaterialSet,
    ]),
  ) as Record<MaterialSetName, ResolvedMaterialSet>;
}

function completeFact(
  authority: "user" | "ai_project_manager" = "ai_project_manager",
): DesignPermissionFact {
  return {
    path: "design/README.md",
    section: "权限分类",
    complete: true,
    reason: null,
    authority,
  };
}

function readiness(touchesUser: boolean): ResolvedReadiness {
  return {
    status: touchesUser ? "concerns" : "pass",
    persisted_status: touchesUser ? "concerns" : "pass",
    assessed_artifacts: [],
    concerns: touchesUser
      ? [
          {
            id: "security-boundary",
            impact: "Changes the authentication boundary.",
            owner: "user",
            resolution: "User must confirm the design.",
            touches_user_confirmation: true,
          },
        ]
      : [],
    assessed_at: "2026-07-14T00:00:00.000Z",
    fresh: true,
    ready: true,
    invalid_reason: null,
  };
}

test("confirmations append revisions and become stale when materials change", () => {
  const initial = createInitialChangeState({
    changeId: "wallet-login",
    title: "连接钱包登录",
    capturedAt: "2026-07-14T00:00:00.000Z",
    projectRevision: null,
  });
  const firstMaterials = materials();
  const first = appendConfirmation(initial, {
    gate: "requirements",
    revision: 1,
    artifacts: firstMaterials.requirements.artifacts,
    confirmedBy: "user",
    confirmedAt: "2026-07-14T01:00:00.000Z",
    summary: "Confirm the requirements baseline.",
    evidence: "The user explicitly confirmed the reviewed baseline.",
  });
  const firstResolved = resolveConfirmations(first, firstMaterials);

  assert.equal(firstResolved.gates.requirements.valid, true);
  assert.equal(firstResolved.gates.requirements.next_revision, 2);

  const changedMaterials = materials(SECOND_DIGEST);
  const stale = resolveConfirmations(first, changedMaterials);
  assert.equal(stale.gates.requirements.status, "invalidated");
  assert.equal(stale.gates.requirements.invalid_reason, "material_set_changed");
  assert.equal(
    stale.diagnostics.some((item) => item.code === "confirmation_stale"),
    true,
  );

  const expandedMaterials = materials();
  expandedMaterials.requirements.artifacts.push({ path: "scope.md", digest: SECOND_DIGEST });
  expandedMaterials.requirements.digest = SECOND_DIGEST;
  const expanded = resolveConfirmations(first, expandedMaterials);
  assert.equal(expanded.gates.requirements.status, "invalidated");
  assert.match(
    expanded.diagnostics.find((item) => item.code === "confirmation_stale")?.message ?? "",
    /scope\.md/,
  );

  const missingMaterials = materials();
  missingMaterials.requirements.artifacts = [];
  missingMaterials.requirements.digest = null;
  const missing = resolveConfirmations(first, missingMaterials);
  assert.equal(missing.gates.requirements.status, "invalidated");

  const second = appendConfirmation(first, {
    gate: "requirements",
    revision: 2,
    artifacts: changedMaterials.requirements.artifacts,
    confirmedBy: "user",
    confirmedAt: "2026-07-14T02:00:00.000Z",
    summary: "Confirm the revised requirements baseline.",
    evidence: "The user explicitly confirmed the revised baseline.",
  });
  const secondResolved = resolveConfirmations(second, changedMaterials);
  assert.equal(secondResolved.gates.requirements.valid, true);
  assert.equal(second.gates.requirements.confirmations.length, 2);
  assert.equal(second.gates.requirements.confirmations[0]?.revision, 1);
});

test("confirmation authority preserves user-only gates and design concern ownership", () => {
  assert.equal(
    confirmationAuthorityReason({
      gate: "requirements",
      confirmedBy: "ai_project_manager",
      designPermission: completeFact(),
      readiness: readiness(false),
    }),
    "requirements_confirmation_requires_user",
  );
  assert.equal(
    confirmationAuthorityReason({
      gate: "acceptance",
      confirmedBy: "ai_project_manager",
      designPermission: completeFact(),
      readiness: readiness(false),
    }),
    "acceptance_confirmation_requires_user",
  );
  assert.equal(
    confirmationAuthorityReason({
      gate: "knowledge",
      confirmedBy: "ai_project_manager",
      designPermission: completeFact(),
      readiness: readiness(false),
    }),
    "knowledge_confirmation_requires_user",
  );
  assert.equal(
    confirmationAuthorityReason({
      gate: "design",
      confirmedBy: "ai_project_manager",
      designPermission: completeFact(),
      readiness: readiness(true),
    }),
    "design_concern_requires_user_confirmation",
  );
  assert.equal(
    confirmationAuthorityReason({
      gate: "design",
      confirmedBy: "ai_project_manager",
      designPermission: completeFact("user"),
      readiness: readiness(false),
    }),
    "design_requires_user_confirmation",
  );
  assert.equal(
    confirmationAuthorityReason({
      gate: "design",
      confirmedBy: "ai_project_manager",
      designPermission: completeFact(),
      readiness: readiness(false),
    }),
    null,
  );
});
