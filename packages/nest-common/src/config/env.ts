import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

import { type DynamicModule, Inject, Module } from "@nestjs/common";
import type { z } from "zod";

export const APP_CONFIG = Symbol("APP_CONFIG");

/** Injects the parsed, typed service config registered by `AppConfigModule.forRoot`. */
export const InjectConfig = () => Inject(APP_CONFIG);

/**
 * Loads the nearest `.env` walking up from `start`. Services run with cwd = apps/<svc> while the
 * monorepo keeps a single root `.env`. Existing environment variables win; no file (Lambda) is a no-op.
 */
export function loadEnvFile(start = process.cwd(), maxDepth = 4): string | undefined {
  let dir = start;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      for (const [key, value] of Object.entries(parseEnv(readFileSync(candidate, "utf8")))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Validates `env` against a zod schema and fails fast with every problem listed. */
export function parseConfig<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}\nSee .env.example`);
  }
  return result.data;
}

@Module({})
export class AppConfigModule {
  static forRoot<T extends z.ZodType>(schema: T): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [
        {
          provide: APP_CONFIG,
          useFactory: () => {
            loadEnvFile();
            return parseConfig(schema);
          },
        },
      ],
      exports: [APP_CONFIG],
    };
  }
}
