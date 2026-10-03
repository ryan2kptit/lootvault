#!/usr/bin/env node
// Local environment health check. Exit code 0 = everything needed for `npm run dev` is up.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const envPath = fileURLToPath(new URL("../.env", import.meta.url));
const REQUEST_TIMEOUT_MS = 5000;
const START_HINT = "run `npm run infra:up`";
let failures = 0;

// Node's fetch hides the real reason (ECONNREFUSED, ...) in error.cause; surface it.
function describe(error) {
  if (error.name === "TimeoutError") return `timed out after ${REQUEST_TIMEOUT_MS}ms`;
  const code = error.cause?.code;
  return code ? `${error.message} (${code})` : error.message;
}

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`✔ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures += 1;
    console.log(`✖ ${name} — ${describe(error)}`);
  }
}

// Wraps a network call: when the service cannot be reached at all (refused/timeout), add the fix hint.
async function reachable(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.name === "TimeoutError" || error.message === "fetch failed") {
      throw new Error(`${describe(error)}; ${START_HINT}`);
    }
    throw error;
  }
}

async function rpc(method, params = []) {
  const response = await fetch(process.env.RPC_URL || "http://127.0.0.1:8545", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let body;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("unexpected non-JSON reply from RPC_URL");
    throw error;
  }
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
  let state;
  try {
    state = execFileSync(
      "docker",
      ["compose", "exec", "-T", "mongo", "mongosh", "--quiet", "--eval", "rs.status().myState"],
      // cwd: `docker compose` must find docker-compose.yml no matter where doctor is run from.
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (error) {
    const reason =
      error.code === "ENOENT" ? "docker CLI not found" : (String(error.stderr ?? "").trim().split("\n")[0] || "command failed");
    throw new Error(`cannot query the mongo container (${reason}); ${START_HINT}`);
  }
  if (state !== "1") throw new Error(`myState=${state}; ${START_HINT}`);
  return "rs0";
});

await check("AWS emulator (moto)", () =>
  reachable(async () => {
    const endpoint = process.env.AWS_ENDPOINT_URL || "http://localhost:4566";
    const response = await fetch(`${endpoint}/`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return endpoint;
  }),
);

await check("Chain (anvil)", () =>
  reachable(async () => {
    const chainId = Number.parseInt(await rpc("eth_chainId"), 16);
    const expected = Number(process.env.CHAIN_ID || 31337);
    if (chainId !== expected) throw new Error(`chainId ${chainId}, expected ${expected}`);
    const block = Number.parseInt(await rpc("eth_blockNumber"), 16);
    return `chainId ${chainId}, block ${block}`;
  }),
);

await check("LootVault1155 deployed", () =>
  reachable(async () => {
    const address = process.env.CONTRACT_ADDRESS;
    if (!address) throw new Error("CONTRACT_ADDRESS empty; run `npm run deploy:local`");
    const code = await rpc("eth_getCode", [address, "latest"]);
    if (!code || code === "0x") throw new Error(`no code at ${address}; chain was reset, run \`npm run deploy:local\``);
    return address;
  }),
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
