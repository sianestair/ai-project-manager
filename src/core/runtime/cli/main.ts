#!/usr/bin/env node

import { runCli } from "./create-cli.js";
import { toPmError } from "./errors.js";

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  const pmError = toPmError(error);
  const wantsJson = process.argv.includes("--json");

  if (wantsJson) {
    console.error(
      JSON.stringify(
        {
          error: {
            code: pmError.code,
            message: pmError.message,
            details: pmError.details,
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.error("ERROR " + pmError.code + ": " + pmError.message);
    for (const detail of pmError.details) {
      console.error("- " + detail);
    }
  }

  process.exitCode = pmError.exitCode;
}
