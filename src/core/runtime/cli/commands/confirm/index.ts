import type { CAC } from "cac";

import { confirmChange } from "../../../operations/confirm.js";
import { EXIT_CODES } from "../../errors.js";
import {
  readCommandOptions,
  readProjectCommandOptions,
  readRequiredStringOption,
} from "../../options.js";
import { printJson } from "../../output.js";

export function registerConfirmCommand(cli: CAC): void {
  cli
    .command("confirm <gate> <id>", "Bind an explicit confirmation to the current material set")
    .option("--confirmed-by <actor>", "Set user or ai_project_manager as confirmer")
    .option("--summary <summary>", "Describe what the confirmation covers")
    .option("--evidence <evidence>", "Describe the explicit confirmation evidence")
    .action(async (gate: string, changeId: string, rawOptions: unknown) => {
      const values = readCommandOptions(rawOptions);
      const options = readProjectCommandOptions(values);
      const result = await confirmChange({
        ...(options.project === undefined ? {} : { project: options.project }),
        changeId,
        gate,
        confirmedBy: readRequiredStringOption(values, "confirmedBy", "confirmed-by"),
        summary: readRequiredStringOption(values, "summary"),
        evidence: readRequiredStringOption(values, "evidence"),
      });

      if (options.json) {
        printJson({ command: "confirm", ...result });
      } else {
        console.log(
          "Confirmed " +
            result.gate +
            " revision " +
            String(result.revision) +
            " for Change " +
            result.changeId +
            ".",
        );
      }

      return EXIT_CODES.success;
    });
}
