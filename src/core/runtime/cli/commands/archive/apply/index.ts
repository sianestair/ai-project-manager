import type { CAC } from "cac";

import { archiveChange } from "../../../../operations/archive.js";
import { EXIT_CODES } from "../../../errors.js";
import { readCommandOptions, readProjectCommandOptions } from "../../../options.js";
import { printJson } from "../../../output.js";

export function registerArchiveApplyCommand(cli: CAC): void {
  cli
    .command("archive-apply <id>", "Record terminal references and atomically archive the Change")
    .usage("archive apply <id>")
    .action(async (changeId: string, rawOptions: unknown) => {
      const options = readProjectCommandOptions(readCommandOptions(rawOptions));
      const result = await archiveChange({
        ...(options.project === undefined ? {} : { project: options.project }),
        changeId,
      });
      if (options.json) {
        printJson({ command: "archive apply", ...result });
      } else {
        console.log("Archived Change " + result.changeId + " at " + result.archivedPath + ".");
      }
      return EXIT_CODES.success;
    });
}
