import { randomUUID } from "node:crypto";

import { type DynamicModule, RequestMethod } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

/**
 * Structured JSON logs (pretty-printed locally) with a request id taken from `x-request-id`
 * or generated, echoed back in the response so a single id traces a request across services.
 * Options are read when the module is created, so LOG_LEVEL / LOG_PRETTY set by tests apply.
 */
export function createLoggerModule(service: string): DynamicModule {
  return LoggerModule.forRootAsync({
    useFactory: () => {
      const pretty = process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY !== "false";
      return {
        // Express 5 wildcard syntax (the default "*" triggers a path-to-regexp deprecation warning).
        forRoutes: [{ path: "{*path}", method: RequestMethod.ALL }],
        pinoHttp: {
          name: service,
          level: process.env.LOG_LEVEL ?? "info",
          genReqId: (req, res) => {
            const id = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
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
