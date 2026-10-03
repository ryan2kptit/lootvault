#!/usr/bin/env node
// Creates .env from .env.example, or adds keys introduced since the .env was created
// (existing values are never overwritten).
import { copyFileSync, existsSync } from "node:fs";

import { readEnv, upsertEnv } from "./lib/env-file.mjs";
import { EXAMPLE_ENV_URL, ROOT_ENV_URL } from "./lib/root-env.mjs";

if (!existsSync(ROOT_ENV_URL)) {
  copyFileSync(EXAMPLE_ENV_URL, ROOT_ENV_URL);
  console.log("Created .env from .env.example");
} else {
  const current = readEnv(ROOT_ENV_URL);
  const example = readEnv(EXAMPLE_ENV_URL);
  const missing = Object.fromEntries(Object.entries(example).filter(([key]) => !(key in current)));
  if (Object.keys(missing).length > 0) {
    upsertEnv(ROOT_ENV_URL, missing);
    console.log(`Added ${Object.keys(missing).length} new key(s) to .env: ${Object.keys(missing).join(", ")}`);
  } else {
    console.log(".env is up to date");
  }
}
