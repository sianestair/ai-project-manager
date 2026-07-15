import type { CAC } from "cac";

import { previewKnowledge } from "../../../../operations/knowledge-preview.js";
import { EXIT_CODES } from "../../../errors.js";
import { readCommandOptions, readProjectCommandOptions } from "../../../options.js";
import { printJson } from "../../../output.js";

export function registerKnowledgePreviewCommand(cli: CAC): void {
  cli
    .command("knowledge-preview <id>", "Compile resolved knowledge candidates into knowledge.patch")
    .usage("knowledge preview <id>")
    .action(async (changeId: string, rawOptions: unknown) => {
      const options = readProjectCommandOptions(readCommandOptions(rawOptions));
      const result = await previewKnowledge({
        ...(options.project === undefined ? {} : { project: options.project }),
        changeId,
      });
      if (options.json) {
        printJson({ command: "knowledge preview", ...result });
      } else {
        console.log(result.diff);
        console.log(
          "Knowledge preview ready for Change " +
            result.changeId +
            "; targets: " +
            String(result.targetCount) +
            "; next: " +
            result.nextAction +
            ".",
        );
      }
      return EXIT_CODES.success;
    });
}
