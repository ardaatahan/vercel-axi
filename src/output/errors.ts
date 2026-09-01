// Structured errors rendered as TOON on stdout (AXI principle 6).
// Exit codes: 0 success/no-op, 1 error, 2 usage error.

export class AxiError extends Error {
  exitCode = 1;
  suggestion?: string;
  details: Array<[string, string]>;

  constructor(
    message: string,
    suggestion?: string,
    details: Array<[string, string]> = [],
  ) {
    super(message);
    this.suggestion = suggestion;
    this.details = details;
  }
}

export class UsageError extends AxiError {
  constructor(
    message: string,
    suggestion?: string,
    details: Array<[string, string]> = [],
  ) {
    super(message, suggestion, details);
    this.exitCode = 2;
  }
}

export function renderError(err: AxiError): string {
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const lines = [`error: ${clean(err.message)}`];
  for (const [key, value] of err.details) lines.push(`${key}: ${clean(value)}`);
  if (err.suggestion) lines.push(`suggestion: ${clean(err.suggestion)}`);
  return lines.join("\n");
}
