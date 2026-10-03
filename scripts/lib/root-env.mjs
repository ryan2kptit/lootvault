import { readEnv } from "./env-file.mjs";

export const ROOT_ENV_URL = new URL("../../.env", import.meta.url);
export const EXAMPLE_ENV_URL = new URL("../../.env.example", import.meta.url);

/** Root .env merged over the process environment (process wins), for scripts. */
export function loadRootEnv() {
  const env = { ...readEnv(ROOT_ENV_URL), ...process.env };
  for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;
  return env;
}
