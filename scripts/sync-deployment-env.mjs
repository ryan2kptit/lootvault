#!/usr/bin/env node
// Copies a deployment record into the root .env: node scripts/sync-deployment-env.mjs <network>
import { readFileSync } from "node:fs";

import { upsertEnv } from "./lib/env-file.mjs";

const networkName = process.argv[2] ?? "localhost";
const deployment = JSON.parse(
  readFileSync(new URL(`../packages/contracts/deployments/${networkName}.json`, import.meta.url), "utf8"),
);
upsertEnv(new URL("../.env", import.meta.url), {
  CONTRACT_ADDRESS: deployment.address,
  START_BLOCK: String(deployment.startBlock),
});
console.log(`.env updated: CONTRACT_ADDRESS=${deployment.address} START_BLOCK=${deployment.startBlock}`);
