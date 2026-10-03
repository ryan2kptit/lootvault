#!/usr/bin/env node
// Deploys LootVault1155 to the local chain unless CONTRACT_ADDRESS already has code there.
// `--force` redeploys (a new contract: existing orders/items stay in Mongo but point at the old one).
import { spawnSync } from "node:child_process";

import { assertLocalRpc } from "./lib/local-guard.mjs";
import { loadRootEnv } from "./lib/root-env.mjs";

const env = loadRootEnv();
const force = process.argv.includes("--force");

// Local chain only, even with --force: a mis-pointed RPC_URL must never receive a deployment.
await assertLocalRpc(env.RPC_URL);

async function codeAt(address) {
  const response = await fetch(env.RPC_URL ?? "http://127.0.0.1:8545", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
  });
  return (await response.json()).result;
}

if (!force && env.CONTRACT_ADDRESS) {
  const code = await codeAt(env.CONTRACT_ADDRESS);
  if (code && code !== "0x") {
    console.log(`✔ LootVault1155 already deployed at ${env.CONTRACT_ADDRESS} (use --force to redeploy)`);
    process.exit(0);
  }
}

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run("npm", ["run", "deploy", "-w", "@lootvault/contracts", "--", "--network", "localhost"]);
run("node", ["scripts/sync-deployment-env.mjs", "localhost"]);
