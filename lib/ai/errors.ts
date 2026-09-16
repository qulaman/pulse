export type ParseErrorCode = "parse_refused" | "parse_failed";

/** Frontend error contract (docs/AI.md §11). Carries no prompt content and no keys. */
export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "ParseError";
    this.code = code;
  }
}
