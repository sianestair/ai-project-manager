import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import {
  readinessArtifacts,
  resolveReadiness,
} from "../../src/core/runtime/governance/readiness.js";
import type {
  MaterialSetName,
  ReadinessRecord,
  ResolvedMaterialSet,
} from "../../src/core/runtime/state/types.js";

const DIGEST = "a".repeat(64);

function materials(designDigest = DIGEST) {
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
        artifacts: [{ path, digest: name === "design" ? designDigest : DIGEST }],
        digest: name === "design" ? designDigest : DIGEST,
      } satisfies ResolvedMaterialSet,
    ]),
  ) as Record<MaterialSetName, ResolvedMaterialSet>;
}

function passRecord(resolvedMaterials: ReturnType<typeof materials>): ReadinessRecord {
  return {
    status: "pass",
    assessed_artifacts: readinessArtifacts(resolvedMaterials),
    concerns: [],
    assessed_at: "2026-07-14T00:00:00.000Z",
  };
}

test("a pass readiness record is fresh only for the assessed material versions", () => {
  const firstMaterials = materials();
  const record = passRecord(firstMaterials);
  const fresh = resolveReadiness(record, firstMaterials);

  assert.equal(fresh.readiness.status, "pass");
  assert.equal(fresh.readiness.fresh, true);
  assert.equal(fresh.readiness.ready, true);

  const stale = resolveReadiness(record, materials("b".repeat(64)));
  assert.equal(stale.readiness.status, "stale");
  assert.equal(stale.readiness.ready, false);
  assert.equal(
    stale.diagnostics.some((item) => item.code === "readiness_stale"),
    true,
  );
});

test("concerns require resolutions and preserve user-confirmation classification", () => {
  const resolvedMaterials = materials();
  const unresolved: ReadinessRecord = {
    status: "concerns",
    assessed_artifacts: readinessArtifacts(resolvedMaterials),
    concerns: [
      {
        id: "security-boundary",
        impact: "Changes the authentication boundary.",
        owner: "user",
        resolution: null,
        touches_user_confirmation: true,
      },
    ],
    assessed_at: "2026-07-14T00:00:00.000Z",
  };
  const blocked = resolveReadiness(unresolved, resolvedMaterials);
  assert.equal(blocked.readiness.ready, false);
  assert.equal(
    blocked.diagnostics.some((item) => item.code === "readiness_concern_unresolved"),
    true,
  );

  const resolved = resolveReadiness(
    {
      ...unresolved,
      concerns: unresolved.concerns.map((concern) => ({
        ...concern,
        resolution: "User confirmation is required at the design gate.",
      })),
    },
    resolvedMaterials,
  );
  assert.equal(resolved.readiness.ready, true);
  assert.equal(resolved.readiness.status, "concerns");
});

test("an explicit fail assessment remains fresh but never ready", () => {
  const resolvedMaterials = materials();
  const failed = resolveReadiness(
    {
      status: "fail",
      assessed_artifacts: readinessArtifacts(resolvedMaterials),
      concerns: [],
      assessed_at: "2026-07-14T00:00:00.000Z",
    },
    resolvedMaterials,
  );

  assert.equal(failed.readiness.status, "fail");
  assert.equal(failed.readiness.fresh, true);
  assert.equal(failed.readiness.ready, false);
  assert.equal(failed.readiness.invalid_reason, "assessment_failed");
});
