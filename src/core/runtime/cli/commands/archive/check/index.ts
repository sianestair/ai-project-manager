import type { CAC } from "cac";

import { checkArchive } from "../../../../operations/archive.js";
import { EXIT_CODES } from "../../../errors.js";
import { readCommandOptions, readProjectCommandOptions } from "../../../options.js";
import { printJson } from "../../../output.js";

export function registerArchiveCheckCommand(cli: CAC): void {
  cli
    .command("archive-check <id>", "Check all terminal gates without moving the Change")
    .usage("archive check <id>")
    .action(async (changeId: string, rawOptions: unknown) => {
      const options = readProjectCommandOptions(readCommandOptions(rawOptions));
      const result = await checkArchive({
        ...(options.project === undefined ? {} : { project: options.project }),
        changeId,
      });
      if (options.json) {
        printJson({ command: "archive check", ...result });
      } else if (result.ready) {
        console.log("Archive check passed for Change " + result.changeId + ".");
      } else {
        console.log("Archive check failed: " + result.unmetConditions.join(", ") + ".");
      }
      return result.ready ? EXIT_CODES.success : EXIT_CODES.validation;
    });
}
