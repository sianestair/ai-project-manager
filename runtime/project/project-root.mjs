import fs from "node:fs";
import path from "node:path";

export const projectConfigFileName = "project.yaml";

export function locateProject(startPath = process.cwd()) {
  const absoluteStart = path.resolve(startPath);
  const startDir = fs.existsSync(absoluteStart) && fs.statSync(absoluteStart).isFile()
    ? path.dirname(absoluteStart)
    : absoluteStart;

  let current = startDir;
  let gitRoot = null;

  while (true) {
    const configPath = path.join(current, projectConfigFileName);
    if (fs.existsSync(configPath)) {
      return {
        projectRoot: current,
        configPath,
        configExists: true,
        rootSource: "project-config",
      };
    }

    if (!gitRoot && fs.existsSync(path.join(current, ".git"))) {
      gitRoot = current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const projectRoot = gitRoot ?? startDir;
  return {
    projectRoot,
    configPath: path.join(projectRoot, projectConfigFileName),
    configExists: false,
    rootSource: gitRoot ? "git-root" : "working-directory",
  };
}
