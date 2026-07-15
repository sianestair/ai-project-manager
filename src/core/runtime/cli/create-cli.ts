import { cac, type CAC } from "cac";

import { getPackageMetadata } from "../project/package-root.js";
import { registerCommands } from "./commands/index.js";
import { EXIT_CODES, PmError } from "./errors.js";

function rethrowCliError(error: unknown): never {
  if (error instanceof PmError) {
    throw error;
  }

  if (error instanceof Error && error.name === "CACError") {
    throw new PmError("invalid_arguments", error.message, EXIT_CODES.usage);
  }

  throw error;
}

function checkGlobalOptions(cli: CAC): void {
  try {
    cli.globalCommand.checkUnknownOptions();
    cli.globalCommand.checkOptionValue();
  } catch (error) {
    rethrowCliError(error);
  }
}

const NESTED_COMMANDS = new Set([
  "archive apply",
  "archive check",
  "knowledge apply",
  "knowledge preview",
  "knowledge recover",
]);

function normalizeNestedCommand(argv: readonly string[]): string[] {
  const nested = argv.slice(0, 2).join(" ");
  return NESTED_COMMANDS.has(nested) ? [nested.replace(" ", "-"), ...argv.slice(2)] : [...argv];
}

function displayNestedCommands(body: string): string {
  return [...NESTED_COMMANDS].reduce(
    (current, nested) => current.replaceAll("pm " + nested.replace(" ", "-"), "pm " + nested),
    body,
  );
}

export function createCli(): CAC {
  const cli = cac("pm");

  cli
    .usage("<command> [options]")
    .option("--project <path>", "Use the project rooted at path")
    .option("--json", "Write machine-readable JSON output")
    .option("-v, --version", "Display the CLI version");

  registerCommands(cli);

  cli.help((sections) =>
    sections.map((section, index) => {
      if (index === 0) {
        return {
          ...section,
          body: "AI Project Manager CLI\n\n" + section.body,
        };
      }

      if (section.title !== "Commands") {
        return { ...section, body: displayNestedCommands(section.body) };
      }

      const commandRows = cli.commands.map((command) => ({
        description: command.description,
        usage: command.usageText ?? command.rawName,
      }));
      const longestUsage = Math.max(...commandRows.map((command) => command.usage.length));
      const body = commandRows
        .map((command) => "  " + command.usage.padEnd(longestUsage) + "  " + command.description)
        .join("\n");

      return { ...section, body };
    }),
  );

  return cli;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const cli = createCli();
  let parsed: ReturnType<CAC["parse"]>;
  const normalizedArgv = normalizeNestedCommand(argv);

  try {
    parsed = cli.parse([process.execPath, "pm", ...normalizedArgv], { run: false });
  } catch (error) {
    rethrowCliError(error);
  }

  if (parsed.options.help === true) {
    return EXIT_CODES.success;
  }

  if (parsed.options.version === true) {
    console.log(getPackageMetadata().version);
    return EXIT_CODES.success;
  }

  if (cli.matchedCommand === undefined) {
    checkGlobalOptions(cli);

    if (parsed.args.length === 0) {
      if (argv.length > 0) {
        throw new PmError("invalid_arguments", "No command was provided.", EXIT_CODES.usage);
      }

      cli.outputHelp();
      return EXIT_CODES.success;
    }

    const command = parsed.args.join(" ");
    if (parsed.args[0] === "change") {
      throw new PmError("unknown_command", "Expected pm change start <id>.", EXIT_CODES.usage);
    }

    throw new PmError("unknown_command", "Unknown command: " + command, EXIT_CODES.usage);
  }

  try {
    const result: unknown = await cli.runMatchedCommand();
    return typeof result === "number" ? result : EXIT_CODES.success;
  } catch (error) {
    rethrowCliError(error);
  }
}
