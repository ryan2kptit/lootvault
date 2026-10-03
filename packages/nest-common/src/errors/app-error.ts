/** A domain error with a stable machine-readable code, rendered as `{ error: { code, message, details } }`. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}
