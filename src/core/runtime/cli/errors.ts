export const EXIT_CODES = {
  success: 0,
  usage: 2,
  validation: 3,
  blocked: 4,
  conflict: 5,
  internal: 6,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class PmError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;
  readonly details: readonly string[];

  constructor(code: string, message: string, exitCode: ExitCode, details: readonly string[] = []) {
    super(message);
    this.name = "PmError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function toPmError(error: unknown): PmError {
  if (error instanceof PmError) {
    return error;
  }

  if (error instanceof Error) {
    return new PmError("internal_error", error.message, EXIT_CODES.internal);
  }

  return new PmError("internal_error", "An unknown internal error occurred.", EXIT_CODES.internal);
}
