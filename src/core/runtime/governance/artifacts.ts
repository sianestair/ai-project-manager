import type { ArtifactDigest } from "../state/types.js";

export function canonicalArtifacts(artifacts: readonly ArtifactDigest[]): ArtifactDigest[] {
  return [...artifacts]
    .map((artifact) => ({ ...artifact }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export function artifactListIsCanonical(artifacts: readonly ArtifactDigest[]): boolean {
  return JSON.stringify(artifacts) === JSON.stringify(canonicalArtifacts(artifacts));
}

export function artifactPathsAreUnique(artifacts: readonly ArtifactDigest[]): boolean {
  return new Set(artifacts.map((artifact) => artifact.path)).size === artifacts.length;
}

export function artifactSetsEqual(
  left: readonly ArtifactDigest[],
  right: readonly ArtifactDigest[],
): boolean {
  return JSON.stringify(canonicalArtifacts(left)) === JSON.stringify(canonicalArtifacts(right));
}

export function changedArtifactPaths(
  recorded: readonly ArtifactDigest[],
  current: readonly ArtifactDigest[],
): string[] {
  const recordedByPath = new Map(recorded.map((artifact) => [artifact.path, artifact.digest]));
  const currentByPath = new Map(current.map((artifact) => [artifact.path, artifact.digest]));
  const paths = new Set([...recordedByPath.keys(), ...currentByPath.keys()]);

  return [...paths].filter((path) => recordedByPath.get(path) !== currentByPath.get(path)).sort();
}
