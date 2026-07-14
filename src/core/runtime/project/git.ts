import { spawnSync } from "node:child_process";

export function getGitRevision(projectRoot: string): string | null {
  const result = spawnSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    return null;
  }

  const revision = result.stdout.trim();
  return revision === "" ? null : revision;
}
