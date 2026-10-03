import { randomUUID } from "node:crypto";

import { type DynamicModule, RequestMethod } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { loadEnvFile } from "../config/env";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Structured JSON logs (pretty-printed locally) with a request id taken from `x-request-id`
 * or generated, echoed back in the response so a single id traces a request across services.
 * Only well-formed incoming ids are trusted (they end up in logs and a response header).
 * Options are read when the module is created, so LOG_LEVEL / LOG_PRETTY set by tests or .env apply.
 */
export function createLoggerModule(service: string): DynamicModule {
  return LoggerModule.forRootAsync({
    useFactory: () => {
      loadEnvFile();
      const pretty = process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY !== "false";
      return {
        // Express 5 wildcard syntax (the default "*" triggers a path-to-regexp deprecation warning).
        forRoutes: [{ path: "{*path}", method: RequestMethod.ALL }],
        pinoHttp: {
          name: service,
          level: process.env.LOG_LEVEL ?? "info",
          genReqId: (req, res) => {
            const incoming = req.headers["x-request-id"];
            const id = typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
            res.setHeader("x-request-id", id);
            return id;
          },
          autoLogging: { ignore: (req) => req.url?.endsWith("/health") ?? false },
          redact: ["req.headers.authorization", 'req.headers["x-internal-key"]'],
          transport: pretty ? { target: "pino-pretty", options: { singleLine: true, translateTime: "HH:MM:ss" } } : undefined,
        },
      };
    },
  });
}
