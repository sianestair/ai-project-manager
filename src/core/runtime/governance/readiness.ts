import {
  artifactListIsCanonical,
  artifactPathsAreUnique,
  artifactSetsEqual,
  canonicalArtifacts,
  changedArtifactPaths,
} from "./artifacts.js";
import type {
  Diagnostic,
  MaterialSetName,
  ReadinessRecord,
  ResolvedMaterialSet,
  ResolvedReadiness,
} from "../state/types.js";

const READINESS_MATERIALS: readonly MaterialSetName[] = ["requirements", "design", "delivery"];

function error(code: string, path: string, message: string): Diagnostic {
  return { severity: "error", code, path, message };
}

export function readinessArtifacts(materials: Record<MaterialSetName, ResolvedMaterialSet>) {
  return canonicalArtifacts(
    READINESS_MATERIALS.flatMap((materialName) => materials[materialName].artifacts),
  );
}

export function resolveReadiness(
  record: ReadinessRecord,
  materials: Record<MaterialSetName, ResolvedMaterialSet>,
): {
  readiness: ResolvedReadiness;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const expectedArtifacts = readinessArtifacts(materials);
  const artifactsCanonical = artifactListIsCanonical(record.assessed_artifacts);
  const artifactsUnique = artifactPathsAreUnique(record.assessed_artifacts);
  const unresolvedConcerns = record.concerns.filter(
    (concern) => concern.resolution === null || concern.resolution.trim() === "",
  );

  if (!artifactsUnique) {
    diagnostics.push(
      error(
        "readiness_artifact_duplicate",
        "readiness.assessed_artifacts",
        "Readiness may bind each artifact path only once.",
      ),
    );
  }

  if (!artifactsCanonical) {
    diagnostics.push(
      error(
        "readiness_artifacts_not_canonical",
        "readiness.assessed_artifacts",
        "Readiness artifacts must be sorted by canonical path.",
      ),
    );
  }

  if (record.status === "not_assessed") {
    if (
      record.assessed_artifacts.length > 0 ||
      record.concerns.length > 0 ||
      record.assessed_at !== null
    ) {
      diagnostics.push(
        error(
          "readiness_not_assessed_has_results",
          "readiness",
          "A not_assessed readiness record cannot contain assessment results.",
        ),
      );
    }

    return {
      readiness: {
        ...record,
        assessed_artifacts: canonicalArtifacts(record.assessed_artifacts),
        persisted_status: record.status,
        fresh: false,
        ready: false,
        invalid_reason: "not_assessed",
      },
      diagnostics,
    };
  }

  if (record.assessed_at === null) {
    diagnostics.push(
      error(
        "readiness_assessed_at_missing",
        "readiness.assessed_at",
        "An assessed readiness record requires assessed_at.",
      ),
    );
  }

  if (record.assessed_artifacts.length === 0) {
    diagnostics.push(
      error(
        "readiness_artifacts_missing",
        "readiness.assessed_artifacts",
        "An assessed readiness record must bind the assessed materials.",
      ),
    );
  }

  if (record.status === "pass" && record.concerns.length > 0) {
    diagnostics.push(
      error(
        "readiness_pass_has_concerns",
        "readiness.concerns",
        "A pass readiness record cannot contain concerns.",
      ),
    );
  }

  if (record.status === "concerns" && record.concerns.length === 0) {
    diagnostics.push(
      error(
        "readiness_concerns_missing",
        "readiness.concerns",
        "A concerns readiness record requires at least one concern.",
      ),
    );
  }

  if (record.status === "concerns" && unresolvedConcerns.length > 0) {
    diagnostics.push(
      error(
        "readiness_concern_unresolved",
        "readiness.concerns",
        "Every readiness concern must have a recorded resolution before implementation.",
      ),
    );
  }

  const fresh =
    record.status !== "stale" &&
    artifactsUnique &&
    artifactsCanonical &&
    artifactSetsEqual(record.assessed_artifacts, expectedArtifacts);
  let status = record.status;
  let invalidReason: string | null = null;

  if (record.status === "stale") {
    invalidReason = "recorded_stale";
  } else if (!fresh) {
    status = "stale";
    invalidReason = "assessed_artifacts_changed";
    const changedPaths = changedArtifactPaths(record.assessed_artifacts, expectedArtifacts);
    diagnostics.push({
      severity: "warning",
      code: "readiness_stale",
      path: "readiness.assessed_artifacts",
      message:
        "Readiness assessed artifacts changed" +
        (changedPaths.length === 0 ? "." : ": " + changedPaths.join(", ") + "."),
    });
  } else if (record.status === "fail") {
    invalidReason = "assessment_failed";
  } else if (record.status === "concerns" && unresolvedConcerns.length > 0) {
    invalidReason = "concerns_unresolved";
  }

  const hasStructuralErrors = diagnostics.some((item) => item.severity === "error");
  const ready =
    fresh &&
    !hasStructuralErrors &&
    (status === "pass" || (status === "concerns" && unresolvedConcerns.length === 0));

  return {
    readiness: {
      ...record,
      status,
      assessed_artifacts: canonicalArtifacts(record.assessed_artifacts),
      persisted_status: record.status,
      fresh,
      ready,
      invalid_reason: hasStructuralErrors ? "invalid_record" : invalidReason,
    },
    diagnostics,
  };
}
