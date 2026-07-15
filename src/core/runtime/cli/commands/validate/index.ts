import type { CAC } from "cac";

import { validationResult } from "../../../operations/validate.js";
import { EXIT_CODES } from "../../errors.js";
import { printJson, renderValidation } from "../../output.js";
import { resolveReadCommand } from "../read-state.js";

export function registerValidateCommand(cli: CAC): void {
  cli
    .command("validate [id]", "Validate canonical Change state")
    .action(async (changeId: string | undefined, rawOptions: unknown) => {
      const { state, json } = await resolveReadCommand(changeId, rawOptions, true);
      const result = validationResult(state);

      if (json) {
        printJson({
          ...result,
          state,
        });
      } else {
        console.log(renderValidation(state));
      }

      return result.valid ? EXIT_CODES.success : EXIT_CODES.validation;
    });
}
