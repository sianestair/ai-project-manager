import type { CAC } from "cac";

import { applyKnowledge } from "../../../../operations/knowledge-apply.js";
import { EXIT_CODES } from "../../../errors.js";
import { readCommandOptions, readProjectCommandOptions } from "../../../options.js";
import { printJson } from "../../../output.js";

export function registerKnowledgeApplyCommand(cli: CAC): void {
  cli
    .command("knowledge-apply <id>", "Atomically apply a confirmed knowledge patch")
    .usage("knowledge apply <id>")
    .action(async (changeId: string, rawOptions: unknown) => {
      const options = readProjectCommandOptions(readCommandOptions(rawOptions));
      const result = await applyKnowledge({
        ...(options.project === undefined ? {} : { project: options.project }),
        changeId,
      });
      if (options.json) {
        printJson({ command: "knowledge apply", ...result });
      } else {
        console.log(
          "Knowledge promotion verified for Change " +
            result.changeId +
            "; applied files: " +
            String(result.appliedFiles.length) +
            ".",
        );
      }
      return EXIT_CODES.success;
    });
}
