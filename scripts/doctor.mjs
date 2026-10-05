#!/usr/bin/env node
// Local environment health check. Exit code 0 = everything needed for `npm run dev` is up.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GetTopicAttributesCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { lootVault1155Abi } from "@lootvault/shared";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { deadLetterQueueUrl } from "./lib/dlq.mjs";
import { readEnv } from "./lib/env-file.mjs";

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

await check(".env has every key from .env.example", () => {
  const missing = Object.keys(readEnv(new URL("../.env.example", import.meta.url))).filter((key) => !(key in process.env));
  if (missing.length > 0) throw new Error(`missing ${missing.join(", ")}; run \`npm run bootstrap\``);
  return undefined;
});

await check("Platform signer key matches the contract", () =>
  reachable(async () => {
    const expected = privateKeyToAccount(process.env.PLATFORM_SIGNER_KEY).address;
    const data = encodeFunctionData({ abi: lootVault1155Abi, functionName: "platformSigner" });
    const result = await rpc("eth_call", [{ to: process.env.CONTRACT_ADDRESS, data }, "latest"]);
    const onChain = decodeFunctionResult({ abi: lootVault1155Abi, functionName: "platformSigner", data: result });
    if (onChain.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`contract trusts ${onChain} but PLATFORM_SIGNER_KEY is ${expected}; every purchase would revert`);
    }
    return expected;
  }),
);

await check("AWS resources (bucket, topic, queues)", async () => {
  const aws = { region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL };
  const hint = "run `npm run bootstrap` (moto forgets everything when its container restarts)";
  try {
    await new S3Client({ ...aws, forcePathStyle: true }).send(new HeadBucketCommand({ Bucket: process.env.MEDIA_BUCKET }));
    await new SNSClient(aws).send(new GetTopicAttributesCommand({ TopicArn: process.env.SNS_TOPIC_ARN }));
    const sqs = new SQSClient(aws);
    for (const url of [process.env.CATALOG_QUEUE_URL, process.env.ORDER_QUEUE_URL]) {
      await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["QueueArn"] }));
    }
  } catch (error) {
    throw new Error(`${error.name ?? "error"}: ${error.message}; ${hint}`);
  }
  return process.env.MEDIA_BUCKET;
});

await check("Dead-letter queues empty", () =>
  reachable(async () => {
    const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL });
    const stuck = [];
    for (const [label, source] of [["catalog", process.env.CATALOG_QUEUE_URL], ["order", process.env.ORDER_QUEUE_URL]]) {
      const url = await deadLetterQueueUrl(sqs, source);
      const { Attributes } = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["ApproximateNumberOfMessages"] }));
      const count = Number(Attributes?.ApproximateNumberOfMessages ?? 0);
      if (count > 0) stuck.push(`${label} DLQ has ${count}`);
    }
    if (stuck.length > 0) throw new Error(`${stuck.join(", ")} message(s) a consumer gave up on; fix the cause, then run \`npm run dlq:redrive\``);
    return "catalog and order";
  }),
);

// Services are optional for doctor (it also runs before `npm run dev`), so they only inform.
const services = { auth: process.env.AUTH_PORT, catalog: process.env.CATALOG_PORT, orders: process.env.ORDER_PORT, indexer: process.env.INDEXER_PORT };
for (const [name, port] of Object.entries(services)) {
  try {
    const response = await fetch(`http://localhost:${port}/${name}/health`, { signal: AbortSignal.timeout(2000) });
    console.log(`${response.ok ? "✔" : "○"} ${name} service on :${port}${response.ok ? "" : ` — HTTP ${response.status}`}`);
  } catch {
    console.log(`○ ${name} service on :${port} — not running (start everything with \`npm run dev\`)`);
  }
}

// Web apps (ports from their `dev` scripts), informational like the services. The first dev request compiles the page.
for (const [name, port] of Object.entries({ studio: 3000, storefront: 3100 })) {
  try {
    const response = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(15_000) });
    console.log(`${response.ok ? "✔" : "○"} ${name} on http://localhost:${port}${response.ok ? "" : ` — HTTP ${response.status}`}`);
  } catch {
    console.log(`○ ${name} on http://localhost:${port} — not running (start everything with \`npm run dev\`)`);
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
