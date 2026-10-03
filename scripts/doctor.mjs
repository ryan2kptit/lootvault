#!/usr/bin/env node
// Local environment health check. Exit code 0 = everything needed for `npm run dev` is up.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`✔ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures += 1;
    console.log(`✖ ${name} — ${error.message}`);
  }
}

async function rpc(method, params = []) {
  const response = await fetch(process.env.RPC_URL ?? "http://127.0.0.1:8545", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

await check("Node >= 22.13", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error(`found ${process.version}; run \`nvm use\``);
  return process.version;
});

await check(".env present", () => {
  if (!existsSync(envPath)) throw new Error("run `cp .env.example .env`");
  process.loadEnvFile(envPath);
  return envPath;
});

await check("MongoDB replica set PRIMARY", () => {
  const state = execFileSync(
    "docker",
    ["compose", "exec", "-T", "mongo", "mongosh", "--quiet", "--eval", "rs.status().myState"],
    { encoding: "utf8" },
  ).trim();
  if (state !== "1") throw new Error(`myState=${state}; run \`npm run infra:up\``);
  return "rs0";
});

await check("AWS emulator (moto)", async () => {
  const endpoint = process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566";
  const response = await fetch(`${endpoint}/`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return endpoint;
});

await check("Chain (anvil)", async () => {
  const chainId = Number.parseInt(await rpc("eth_chainId"), 16);
  const expected = Number(process.env.CHAIN_ID ?? 31337);
  if (chainId !== expected) throw new Error(`chainId ${chainId}, expected ${expected}`);
  const block = Number.parseInt(await rpc("eth_blockNumber"), 16);
  return `chainId ${chainId}, block ${block}`;
});

await check("LootVault1155 deployed", async () => {
  const address = process.env.CONTRACT_ADDRESS;
  if (!address) throw new Error("CONTRACT_ADDRESS empty; run `npm run deploy:local`");
  const code = await rpc("eth_getCode", [address, "latest"]);
  if (!code || code === "0x") throw new Error(`no code at ${address}; chain was reset, run \`npm run deploy:local\``);
  return address;
});

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
