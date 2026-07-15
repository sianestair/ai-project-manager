import type { CAC } from "cac";

import { recoverKnowledgeTransaction } from "../../../../operations/knowledge-apply.js";
import { EXIT_CODES, PmError } from "../../../errors.js";
import {
  readCommandOptions,
  readProjectCommandOptions,
  readRequiredStringOption,
} from "../../../options.js";
import { printJson } from "../../../output.js";

export function registerKnowledgeRecoverCommand(cli: CAC): void {
  cli
    .command("knowledge-recover <id>", "Commit or roll back an interrupted knowledge transaction")
    .usage("knowledge recover <id>")
    .option("--strategy <strategy>", "Use commit or rollback")
    .action(async (changeId: string, rawOptions: unknown) => {
      const values = readCommandOptions(rawOptions);
      const options = readProjectCommandOptions(values);
      const strategy = readRequiredStringOption(values, "strategy");
      if (strategy !== "commit" && strategy !== "rollback") {
        throw new PmError(
          "invalid_arguments",
          "--strategy must be commit or rollback.",
          EXIT_CODES.usage,
        );
      }
      const result = await recoverKnowledgeTransaction({
        ...(options.project === undefined ? {} : { project: options.project }),
        changeId,
        strategy,
      });
      if (options.json) {
        printJson({ command: "knowledge recover", strategy, ...result });
      } else {
        console.log(
          "Knowledge transaction " + strategy + " completed for Change " + result.changeId + ".",
        );
      }
      return EXIT_CODES.success;
    });
}
