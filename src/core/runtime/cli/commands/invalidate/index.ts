import type { CAC } from "cac";

import { invalidateChange } from "../../../operations/invalidate.js";
import { EXIT_CODES } from "../../errors.js";
import {
  readCommandOptions,
  readProjectCommandOptions,
  readRequiredStringOption,
} from "../../options.js";
import { printJson } from "../../output.js";

export function registerInvalidateCommand(cli: CAC): void {
  cli
    .command("invalidate <stage> <id>", "Invalidate an affected stage and its downstream state")
    .option("--reason <reason>", "Record why the workflow must return to this stage")
    .action(async (stage: string, changeId: string, rawOptions: unknown) => {
      const values = readCommandOptions(rawOptions);
      const options = readProjectCommandOptions(values);
      const result = await invalidateChange({
        ...(options.project === undefined ? {} : { project: options.project }),
        changeId,
        stage,
        reason: readRequiredStringOption(values, "reason"),
      });

      if (options.json) {
        printJson({ command: "invalidate", ...result });
      } else {
        console.log(
          "Invalidated " +
            result.stage +
            " for Change " +
            result.changeId +
            "; next: " +
            result.nextAction +
            ".",
        );
      }

      return EXIT_CODES.success;
    });
}
