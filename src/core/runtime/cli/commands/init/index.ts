import { resolve } from "node:path";

import type { CAC } from "cac";

import { initializeProject } from "../../../project/init.js";
import { EXIT_CODES } from "../../errors.js";
import {
  readCommandOptions,
  readOptionalStringOption,
  readProjectCommandOptions,
} from "../../options.js";
import { printJson } from "../../output.js";

export function registerInitCommand(cli: CAC): void {
  cli
    .command("init", "Initialize AI Project Manager files in a project")
    .option("--project-id <id>", "Set the managed project identifier")
    .action(async (rawOptions: unknown) => {
      const values = readCommandOptions(rawOptions);
      const options = readProjectCommandOptions(values);
      const projectId = readOptionalStringOption(values, "projectId", "project-id");
      const result = await initializeProject({
        projectRoot: resolve(options.project ?? process.cwd()),
        ...(projectId === undefined ? {} : { projectId }),
      });

      if (options.json) {
        printJson({
          command: "init",
          ...result,
        });
      } else {
        console.log(
          (result.created ? "Initialized" : "Already initialized") +
            " project " +
            result.projectId +
            " at " +
            result.projectRoot +
            ".",
        );
      }

      return EXIT_CODES.success;
    });
}
