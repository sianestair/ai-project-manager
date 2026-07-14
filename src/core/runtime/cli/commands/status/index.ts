import type { CAC } from "cac";

import { validationResult } from "../../../operations/validate.js";
import { EXIT_CODES } from "../../errors.js";
import { printJson, renderStatus } from "../../output.js";
import { resolveReadCommand } from "../read-state.js";

export function registerStatusCommand(cli: CAC): void {
  cli
    .command("status [id]", "Resolve and display canonical Change state")
    .action(async (changeId: string | undefined, rawOptions: unknown) => {
      const { state, json } = await resolveReadCommand(changeId, rawOptions);
      const result = validationResult(state);

      if (json) {
        printJson(state);
      } else {
        console.log(renderStatus(state));
      }

      return result.valid ? EXIT_CODES.success : EXIT_CODES.validation;
    });
}
