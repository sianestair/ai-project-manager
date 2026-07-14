import type { CAC } from "cac";

import { startChange } from "../../../../project/change-start.js";
import { findProjectRoot, readProjectConfig } from "../../../../project/discover.js";
import { EXIT_CODES, PmError } from "../../../errors.js";
import {
  readCommandOptions,
  readOptionalStringOption,
  readProjectCommandOptions,
} from "../../../options.js";
import { printJson } from "../../../output.js";

export function registerChangeStartCommand(cli: CAC): void {
  cli
    .command("change <operation> <id>", "Start a new active Change")
    .usage("change start <id>")
    .option("--title <title>", "Set the Change title")
    .action(async (operation: string, changeId: string, rawOptions: unknown) => {
      if (operation !== "start") {
        throw new PmError("unknown_command", "Expected pm change start <id>.", EXIT_CODES.usage);
      }

      const values = readCommandOptions(rawOptions);
      const options = readProjectCommandOptions(values);
      const title = readOptionalStringOption(values, "title");
      const projectRoot = await findProjectRoot(options.project);
      await readProjectConfig(projectRoot);
      const result = await startChange({
        projectRoot,
        changeId,
        ...(title === undefined ? {} : { title }),
      });

      if (options.json) {
        printJson({
          command: "change start",
          ...result,
        });
      } else {
        console.log("Started Change " + result.changeId + " at " + result.changeDirectory + ".");
      }

      return EXIT_CODES.success;
    });
}
