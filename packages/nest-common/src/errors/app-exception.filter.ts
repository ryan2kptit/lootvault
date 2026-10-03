import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

import { AppError } from "./app-error";

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const CODES_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  429: "TOO_MANY_REQUESTS",
};

/** Maps any thrown value to the API error envelope. Unknown errors become an opaque 500. */
export function toErrorResponse(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof AppError) {
    const { code, message, details } = exception;
    return { status: exception.status, body: { error: { code, message, ...(details === undefined ? {} : { details }) } } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message = typeof response === "string" ? response : (response as { message?: unknown }).message;
    if (status === 400 && Array.isArray(message)) {
      return { status, body: { error: { code: "VALIDATION_FAILED", message: "Request validation failed", details: message } } };
    }
    return {
      status,
      body: { error: { code: CODES_BY_STATUS[status] ?? "HTTP_ERROR", message: typeof message === "string" ? message : exception.message } },
    };
  }
  if (typeof exception === "object" && exception !== null) {
    // body-parser / http-errors (e.g. PayloadTooLargeError) are plain Errors that carry an HTTP status.
    const { status, statusCode, expose } = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
    const clientStatus = typeof status === "number" ? status : statusCode;
    if (typeof clientStatus === "number" && clientStatus >= 400 && clientStatus <= 499 && expose === true) {
      return {
        status: clientStatus,
        body: { error: { code: CODES_BY_STATUS[clientStatus] ?? "HTTP_ERROR", message: (exception as Error).message } },
      };
    }
  }
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } } };
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
