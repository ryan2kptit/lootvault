# LootVault Plan 1: Foundation, Contract & Shared Package

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the LootVault monorepo, a persistent local infra stack (Mongo replica set, moto, anvil), the `LootVault1155` contract with its full test suite, and the `@lootvault/shared` package (EIP-712 types, event types, ABI) that every later plan consumes.

**Architecture:** npm workspaces monorepo. `packages/contracts` (Hardhat 3, viem, node:test) is the source of the ABI. `packages/shared` (TypeScript compiled to CommonJS) holds the EIP-712 definitions used by both the contract tests and the backend signer, so any mismatch fails a test. Local infra runs in Docker Compose: anvil keeps chain state across restarts via `--state`.

**Tech Stack:** Node 22 LTS, npm workspaces, TypeScript 5.9, Hardhat 3.18 + `@nomicfoundation/hardhat-toolbox-viem` 5, viem 2.57, OpenZeppelin Contracts 5.6, Solidity 0.8.28, Docker Compose (mongo 7.0, moto, anvil 1.5.1).

**Spec:** `docs/superpowers/specs/2026-10-03-lootvault-design.md` (sections 4, 9, 11).

**Plan series:**
- **This plan (1/4).**
- Plan 2: Backend services.
- Plan 3: Frontends.
- Plan 4: AWS deployment and docs.

## Global Constraints

- **Node:** `>=22.13.0`, pinned with `.nvmrc` = `22`. `.npmrc` sets `engine-strict=true`.
- **Package scope:** `@lootvault/*`. All packages are `"private": true`.
- **Versions:**

  | Dependency | Version |
  |---|---|
  | TypeScript | `~5.9.3` (root, shared by every workspace) |
  | viem | `^2.57.2` |
  | hardhat | `^3.18.1` |
  | `@nomicfoundation/hardhat-toolbox-viem` | `^5.0.7` |
  | `@nomicfoundation/hardhat-ignition` | `^3.1.8` |
  | `@openzeppelin/contracts` | `^5.6.1` |
  | Solidity | `0.8.28` (optimizer on, 200 runs) |

- **Chain IDs:** `31337` for local (anvil), `84532` for Base Sepolia.
- **EIP-712 domain:**
  - Values: `name = "LootVault"`, `version = "1"`, `chainId`, `verifyingContract`.
  - Type strings must match the contract byte for byte:
    - `Line(uint256 tokenId,address creator,uint256 quantity,uint256 unitPrice,uint256 maxSupply)`
    - `Checkout(bytes32 orderId,address buyer,Line[] lines,uint256 deadline)`
- **`tokenId` mapping:** `tokenId = BigInt("0x" + mongoObjectIdHex)`. The metadata file name is the tokenId as **64 lowercase hex chars without `0x`**, plus `.json`.
- **Event IDs:** `"{chainId}:{txHash lowercase}:{logIndex}"`. Event types are `chain.Purchased` and `chain.TransferSingle`.
- **Default fee:** 250 bps. Maximum 1000 bps.
- **Local anvil accounts** (public test keys, never use on a real network):

  | # | Role | Address | Private key |
  |---|---|---|---|
  | 0 | Deployer / owner | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
  | 1 | Platform signer | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
  | 2 | Treasury | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | — |

- **Commit messages** end with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

  Add the decision trailers `Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:` whenever a design decision is made.
- **Shell:** the user's shell is zsh. Quote globs (for example `"dist/**/*.test.js"`). Do not rely on unquoted variable word-splitting.
- **Before each session,** run `source ~/.nvm/nvm.sh && nvm use` in the repo root. Node 22.16.0 is already installed through nvm.

## File map

| Path | Responsibility |
|---|---|
| `package.json`, `.npmrc`, `.nvmrc`, `.gitignore`, `.editorconfig`, `.prettierrc`, `tsconfig.base.json`, `.env.example` | Monorepo root config |
| `docker/anvil/Dockerfile` | anvil image built from Debian and GitHub Releases. ghcr.io is avoided because it returns 403 on this machine |
| `docker-compose.yml` | mongo (replica set `rs0`), aws (moto), chain (anvil with persisted state) |
| `scripts/doctor.mjs` | Environment health checks (extended in Plan 2) |
| `scripts/lib/env-file.mjs` + `.test.mjs` | `upsertEnv()`: idempotent `.env` key updates |
| `scripts/sync-deployment-env.mjs` | Copies a deployment's address and start block into the root `.env` |
| `packages/shared/src/eip712.ts` | EIP-712 domain, types, `checkoutTypedData()` |
| `packages/shared/src/events.ts` | Event envelope types and `eventId()` |
| `packages/shared/src/ids.ts` | itemId ↔ tokenId and the metadata file name |
| `packages/shared/src/abi/lootVault1155.ts` | Generated ABI (`as const`), committed |
| `packages/shared/src/index.ts` | Barrel export |
| `packages/contracts/contracts/LootVault1155.sol` | The contract |
| `packages/contracts/test/LootVault1155.test.ts` | 14 behaviour tests (node:test + viem assertions) |
| `packages/contracts/scripts/deploy.ts` | Deploys to any network and writes `deployments/<network>.json` |
| `packages/contracts/scripts/export-abi.mjs` | Writes the ABI into the shared package |

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `.npmrc`, `.nvmrc`, `.gitignore`, `.editorconfig`, `.prettierrc`, `tsconfig.base.json`, `.env.example`
- Test: `scripts/lib/env-file.test.mjs` (first real code in the repo, kept here so the scaffold has a test cycle)
- Create: `scripts/lib/env-file.mjs`

**Interfaces:**
- Produces: `upsertEnv(fileUrl: URL, values: Record<string,string>): void` in `scripts/lib/env-file.mjs`.
- Produces: root scripts `test:scripts`, `doctor`, `infra:up`, `infra:down`, `infra:reset`.

- [ ] **Step 1: Write root config files**

`package.json`:
```json
{
  "name": "lootvault",
  "private": true,
  "description": "Multi-store NFT marketplace: NestJS microservices, MongoDB, Next.js, Solidity, AWS",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "test:scripts": "node --test \"scripts/**/*.test.mjs\"",
    "doctor": "node scripts/doctor.mjs",
    "infra:up": "docker compose up -d --build --wait",
    "infra:down": "docker compose down",
    "infra:reset": "docker compose down -v"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "prettier": "^3.6.2",
    "typescript": "~5.9.3"
  }
}
```

`.npmrc`:
```
engine-strict=true
```

`.nvmrc`:
```
22
```

`.gitignore`:
```
node_modules/
dist/
coverage/
*.log
.DS_Store
.env
packages/contracts/artifacts/
packages/contracts/cache/
packages/contracts/deployments/localhost.json
```

`.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.prettierrc`:
```json
{ "printWidth": 120, "singleQuote": false, "trailingComma": "all" }
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`.env.example`:
```bash
# ===================== LootVault local environment =====================
# Copy to .env (`cp .env.example .env`). Generated values are filled in by scripts.

# ---------- Chain (local anvil)
# The keys below are anvil's PUBLIC default test keys. NEVER use them on a real network.
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PLATFORM_SIGNER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
TREASURY_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
METADATA_BASE_URI=http://localhost:4566/lootvault-media/metadata/{id}.json
# Written by `npm run deploy:local`
CONTRACT_ADDRESS=
START_BLOCK=

# ---------- MongoDB (docker compose, replica set rs0)
MONGO_URL=mongodb://localhost:27017/?replicaSet=rs0&directConnection=true

# ---------- AWS emulator (moto)
AWS_ENDPOINT_URL=http://localhost:4566
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

- [ ] **Step 2: Write the failing test for `upsertEnv`**

`scripts/lib/env-file.test.mjs`:
```js
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import { upsertEnv } from "./env-file.mjs";

const tmpEnv = (content) => {
  const file = join(mkdtempSync(join(tmpdir(), "envfile-")), ".env");
  if (content !== undefined) writeFileSync(file, content);
  return pathToFileURL(file);
};

describe("upsertEnv", () => {
  it("replaces existing keys in place and keeps comments", () => {
    const url = tmpEnv("# chain\nCONTRACT_ADDRESS=\nOTHER=1\n");
    upsertEnv(url, { CONTRACT_ADDRESS: "0xabc" });
    assert.equal(readFileSync(url, "utf8"), "# chain\nCONTRACT_ADDRESS=0xabc\nOTHER=1\n");
  });

  it("appends missing keys", () => {
    const url = tmpEnv("A=1\n");
    upsertEnv(url, { B: "2" });
    assert.equal(readFileSync(url, "utf8"), "A=1\nB=2\n");
  });

  it("creates the file when it does not exist", () => {
    const url = tmpEnv(undefined);
    upsertEnv(url, { START_BLOCK: "7" });
    assert.equal(readFileSync(url, "utf8"), "START_BLOCK=7\n");
  });

  it("is idempotent", () => {
    const url = tmpEnv("A=1\n");
    upsertEnv(url, { A: "2" });
    upsertEnv(url, { A: "2" });
    assert.equal(readFileSync(url, "utf8"), "A=2\n");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use && npm install && npm run test:scripts`
Expected: FAIL with `Cannot find module '.../scripts/lib/env-file.mjs'`.

- [ ] **Step 4: Implement `upsertEnv`**

`scripts/lib/env-file.mjs`:
```js
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Set KEY=value pairs in a dotenv file, replacing existing keys in place and
 * appending new ones. Comments and unrelated lines are preserved.
 * @param {URL} fileUrl
 * @param {Record<string, string>} values
 */
export function upsertEnv(fileUrl, values) {
  const lines = existsSync(fileUrl) ? readFileSync(fileUrl, "utf8").replace(/\n+$/, "").split("\n") : [];
  if (lines.length === 1 && lines[0] === "") lines.pop();
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  writeFileSync(fileUrl, `${lines.join("\n")}\n`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:scripts`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: Create the local env file and commit**

```bash
cp .env.example .env
git add -A
git commit -m "chore: scaffold npm-workspaces monorepo with Node 22 and env tooling

Constraint: Node >=22.13 (Hardhat 3 requirement; Node 20 is EOL)
Confidence: high
Scope-risk: low
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Local infrastructure (Mongo replica set, moto, persistent anvil) and doctor

**Files:**
- Create: `docker/anvil/Dockerfile`, `docker-compose.yml`, `scripts/doctor.mjs`

**Interfaces:**
- Produces these ports:

  | Port | Service | Notes |
  |---|---|---|
  | `27017` | Mongo | Replica set `rs0`. Clients use `?replicaSet=rs0&directConnection=true` |
  | `4566` | moto | S3, SNS, SQS |
  | `8545` | anvil | chainId 31337 |

- Produces: `npm run doctor`, which exits 0 when the infra is healthy. Plan 2 extends it.

- [ ] **Step 1: Write the anvil image**

`docker/anvil/Dockerfile`:
```dockerfile
# Local EVM chain for development: Foundry's anvil with on-disk state.
# Built from Docker Hub + GitHub Releases on purpose: pulls from ghcr.io fail (403)
# on the author's machine, and this keeps the setup reproducible elsewhere too.
FROM debian:bookworm-slim
ARG FOUNDRY_VERSION=v1.5.1
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/foundry_${FOUNDRY_VERSION}_linux_${TARGETARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin anvil \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
EXPOSE 8545
ENTRYPOINT ["anvil"]
```

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
name: lootvault

services:
  mongo:
    image: mongo:7.0
    command: ["--replSet", "rs0", "--bind_ip_all", "--quiet"]
    ports: ["27017:27017"]
    volumes: ["mongo-data:/data/db"]
    healthcheck:
      # Initiates the single-node replica set on first boot, then reports PRIMARY.
      test:
        - CMD
        - mongosh
        - --quiet
        - --eval
        - "try { quit(rs.status().myState === 1 ? 0 : 1) } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }); quit(1) }"
      interval: 3s
      timeout: 10s
      retries: 40
      start_period: 5s

  aws:
    # moto: open-source S3/SNS/SQS emulator. LocalStack's free image needs an auth token since 2026-03.
    # Pinned by digest (moto 5.2.3.dev0). NOTE: moto state is in-memory; `npm run bootstrap` re-creates it.
    image: motoserver/moto@sha256:91fd602a21f49cf9eb82fdf474015a3c131d40104c8297ea6a2ca920708ae32c
    ports: ["4566:5000"]
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/')"]
      interval: 3s
      timeout: 5s
      retries: 20

  chain:
    build: ./docker/anvil
    image: lootvault-anvil:1.5.1
    # --state persists the whole chain (contracts, balances, blocks) across restarts.
    command: ["--host", "0.0.0.0", "--chain-id", "31337", "--state", "/data/anvil-state.json", "--state-interval", "5"]
    ports: ["8545:8545"]
    volumes: ["chain-data:/data"]
    healthcheck:
      test: ["CMD-SHELL", "bash -c 'echo > /dev/tcp/127.0.0.1/8545'"]
      interval: 3s
      timeout: 5s
      retries: 20

volumes:
  mongo-data:
  chain-data:
```

- [ ] **Step 3: Write `scripts/doctor.mjs`**

```js
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
```

- [ ] **Step 4: Start infra and verify**

Run: `npm run infra:up`
Expected: all three containers report `Healthy`. The first build of `lootvault-anvil` takes about 30s.

Run: `npm run doctor`
Expected:
- ✔ for Node, `.env`, MongoDB, moto and Chain.
- ✖ for `LootVault1155 deployed — CONTRACT_ADDRESS empty`. This is expected until Task 5.
- The process exits with code 1.

- [ ] **Step 5: Verify chain persistence across restarts**

Run:
```bash
curl -s -X POST localhost:8545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"anvil_mine","params":["0x5"]}'
sleep 6
docker compose restart chain && sleep 3
curl -s -X POST localhost:8545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```
Expected: `"result":"0x5"` (or higher). Block height survives the restart.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(infra): docker compose with mongo rs0, moto and persistent anvil; add doctor

Constraint: ghcr.io pulls return 403 on this machine; anvil image built from Debian + GitHub Releases
Rejected: LocalStack latest | requires auth token since 2026-03
Rejected: hardhat node | loses chain state on restart, desyncs from Mongo
Confidence: high
Scope-risk: low
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `@lootvault/shared`: EIP-712, events, id helpers

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/eip712.ts`, `packages/shared/src/events.ts`, `packages/shared/src/ids.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/ids.test.ts`, `packages/shared/src/events.test.ts`, `packages/shared/src/eip712.test.ts`
- Modify: `package.json` (root), adding `postinstall`, `build:packages` and `test:shared`

**Interfaces:**
- Produces (all exported from `@lootvault/shared`):
  - From `eip712.ts`:
    - `EIP712_NAME: "LootVault"`, `EIP712_VERSION: "1"`, `checkoutTypes`
    - `interface CheckoutLine { tokenId: bigint; creator: Address; quantity: bigint; unitPrice: bigint; maxSupply: bigint }`
    - `interface CheckoutMessage { orderId: Hex; buyer: Address; lines: CheckoutLine[]; deadline: bigint }`
    - `lootVaultDomain(chainId: number, verifyingContract: Address)`
    - `checkoutTypedData(chainId: number, verifyingContract: Address, message: CheckoutMessage)`, returning `{domain, types, primaryType: "Checkout", message}`
  - From `events.ts`:
    - `EVENT_TYPES = { Purchased: "chain.Purchased", TransferSingle: "chain.TransferSingle" }` and `type EventType`
    - `interface EventEnvelope<T extends EventType, D> { id; type: T; chainId: number; blockNumber: number; blockTimestamp: number; txHash: Hex; logIndex: number; correlationId?: string; data: D }`
    - `PurchasedData`, `TransferSingleData`, `PurchasedEvent`, `TransferSingleEvent`, `ChainEvent`
    - `eventId(chainId: number, txHash: Hex, logIndex: number): string`
  - From `ids.ts`:
    - `tokenIdFromItemId(itemId: string): bigint`
    - `itemIdFromTokenId(tokenId: bigint): string`
    - `metadataFileName(tokenId: bigint): string`
  - Constants `LOCAL_CHAIN_ID = 31337`, `BASE_SEPOLIA_CHAIN_ID = 84532`.

- [ ] **Step 1: Write package config**

`packages/shared/package.json`:
```json
{
  "name": "@lootvault/shared",
  "version": "0.1.0",
  "private": true,
  "description": "Types and helpers shared by the LootVault contract, services and web apps",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build && node --test \"dist/**/*.test.js\""
  },
  "dependencies": {
    "viem": "^2.57.2"
  }
}
```

`packages/shared/tsconfig.json` (`node10` resolution on purpose: viem is `"type": "module"`, and under `node16` TypeScript refuses CommonJS files importing it, with TS1541/TS1479. `node10` is also NestJS's default, and TS 5.9 accepts it):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node10",
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing tests**

`packages/shared/src/ids.test.ts`:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { itemIdFromTokenId, metadataFileName, tokenIdFromItemId } from "./ids";

describe("ids", () => {
  const itemId = "66fd2c1e9b1d4a0012ab34cd";

  it("maps a Mongo ObjectId to a uint256 tokenId and back", () => {
    const tokenId = tokenIdFromItemId(itemId);
    assert.equal(tokenId, BigInt("0x66fd2c1e9b1d4a0012ab34cd"));
    assert.equal(itemIdFromTokenId(tokenId), itemId);
  });

  it("left-pads small tokenIds back to 24 hex chars", () => {
    assert.equal(itemIdFromTokenId(1n), "000000000000000000000001");
  });

  it("rejects strings that are not 24-char hex ObjectIds", () => {
    assert.throws(() => tokenIdFromItemId("not-an-id"), /ObjectId/);
  });

  it("builds the ERC-1155 {id} metadata file name (64 lowercase hex, no 0x)", () => {
    assert.equal(metadataFileName(tokenIdFromItemId(itemId)), `${"0".repeat(40)}66fd2c1e9b1d4a0012ab34cd.json`);
  });
});
```

`packages/shared/src/events.test.ts`:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENT_TYPES, eventId } from "./events";

describe("events", () => {
  it("builds deterministic event ids with a lower-cased tx hash", () => {
    assert.equal(eventId(31337, "0xABCDEF", 3), "31337:0xabcdef:3");
  });

  it("exposes the two chain event types", () => {
    assert.deepEqual(EVENT_TYPES, { Purchased: "chain.Purchased", TransferSingle: "chain.TransferSingle" });
  });
});
```

`packages/shared/src/eip712.test.ts`:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashTypedData, zeroAddress } from "viem";

import { checkoutTypedData, checkoutTypes } from "./eip712";

describe("eip712", () => {
  const message = {
    orderId: `0x${"11".repeat(32)}` as const,
    buyer: zeroAddress,
    lines: [{ tokenId: 1n, creator: zeroAddress, quantity: 2n, unitPrice: 10n, maxSupply: 5n }],
    deadline: 1_700_000_000n,
  };

  it("builds the LootVault v1 domain", () => {
    const typed = checkoutTypedData(31337, zeroAddress, message);
    assert.deepEqual(typed.domain, { name: "LootVault", version: "1", chainId: 31337, verifyingContract: zeroAddress });
    assert.equal(typed.primaryType, "Checkout");
  });

  it("keeps field order identical to the Solidity typehash", () => {
    assert.deepEqual(
      checkoutTypes.Line.map((f) => `${f.type} ${f.name}`).join(","),
      "uint256 tokenId,address creator,uint256 quantity,uint256 unitPrice,uint256 maxSupply",
    );
    assert.deepEqual(
      checkoutTypes.Checkout.map((f) => `${f.type} ${f.name}`).join(","),
      "bytes32 orderId,address buyer,Line[] lines,uint256 deadline",
    );
  });

  it("produces a stable digest viem can hash", () => {
    const digest = hashTypedData(checkoutTypedData(31337, zeroAddress, message));
    assert.match(digest, /^0x[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm install && npm test -w @lootvault/shared`
Expected: FAIL. tsc errors `Cannot find module './ids'` (and the same for `./events` and `./eip712`).

- [ ] **Step 4: Implement the modules**

`packages/shared/src/eip712.ts`:
```ts
import type { Address, Hex } from "viem";

export const EIP712_NAME = "LootVault";
export const EIP712_VERSION = "1";

/**
 * EIP-712 types for LootVault1155.purchase().
 * MUST mirror LINE_TYPEHASH / CHECKOUT_TYPEHASH in LootVault1155.sol field-for-field;
 * the contract test `hashCheckout matches the off-chain EIP-712 digest` enforces it.
 */
export const checkoutTypes = {
  Checkout: [
    { name: "orderId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "lines", type: "Line[]" },
    { name: "deadline", type: "uint256" },
  ],
  Line: [
    { name: "tokenId", type: "uint256" },
    { name: "creator", type: "address" },
    { name: "quantity", type: "uint256" },
    { name: "unitPrice", type: "uint256" },
    { name: "maxSupply", type: "uint256" },
  ],
} as const;

export interface CheckoutLine {
  tokenId: bigint;
  creator: Address;
  quantity: bigint;
  unitPrice: bigint;
  maxSupply: bigint;
}

export interface CheckoutMessage {
  orderId: Hex;
  buyer: Address;
  lines: CheckoutLine[];
  deadline: bigint;
}

export function lootVaultDomain(chainId: number, verifyingContract: Address) {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract } as const;
}

export function checkoutTypedData(chainId: number, verifyingContract: Address, message: CheckoutMessage) {
  return {
    domain: lootVaultDomain(chainId, verifyingContract),
    types: checkoutTypes,
    primaryType: "Checkout" as const,
    message,
  };
}
```

`packages/shared/src/events.ts`:
```ts
import type { Address, Hex } from "viem";

export const EVENT_TYPES = {
  Purchased: "chain.Purchased",
  TransferSingle: "chain.TransferSingle",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Envelope published to SNS by the indexer and by order-svc's fast-path. */
export interface EventEnvelope<TType extends EventType, TData> {
  /** `${chainId}:${txHash}:${logIndex}`: identical whichever path published it. */
  id: string;
  type: TType;
  chainId: number;
  blockNumber: number;
  blockTimestamp: number;
  txHash: Hex;
  logIndex: number;
  correlationId?: string;
  data: TData;
}

/** Amounts are decimal strings (wei) so the envelope stays JSON-safe. */
export interface PurchasedData {
  orderId: Hex;
  buyer: Address;
  total: string;
  fee: string;
}

export interface TransferSingleData {
  operator: Address;
  from: Address;
  to: Address;
  id: string;
  value: string;
}

export type PurchasedEvent = EventEnvelope<typeof EVENT_TYPES.Purchased, PurchasedData>;
export type TransferSingleEvent = EventEnvelope<typeof EVENT_TYPES.TransferSingle, TransferSingleData>;
export type ChainEvent = PurchasedEvent | TransferSingleEvent;

export function eventId(chainId: number, txHash: Hex, logIndex: number): string {
  return `${chainId}:${txHash.toLowerCase()}:${logIndex}`;
}
```

`packages/shared/src/ids.ts`:
```ts
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Mongo ObjectId (24 hex chars) -> uint256 tokenId. */
export function tokenIdFromItemId(itemId: string): bigint {
  if (!OBJECT_ID.test(itemId)) throw new Error(`Not a Mongo ObjectId: ${itemId}`);
  return BigInt(`0x${itemId}`);
}

/** uint256 tokenId -> Mongo ObjectId hex (lower-case, left-padded to 24 chars). */
export function itemIdFromTokenId(tokenId: bigint): string {
  return tokenId.toString(16).padStart(24, "0");
}

/** ERC-1155 `{id}` substitution: 64 lower-case hex chars, no 0x prefix. */
export function metadataFileName(tokenId: bigint): string {
  return `${tokenId.toString(16).padStart(64, "0")}.json`;
}
```

`packages/shared/src/index.ts`:
```ts
export * from "./eip712";
export * from "./events";
export * from "./ids";

export const LOCAL_CHAIN_ID = 31337;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @lootvault/shared`
Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 6: Build shared automatically after install**

Modify the root `package.json` `scripts`. Add these three entries and keep the existing ones:
```json
    "postinstall": "npm run build -w @lootvault/shared",
    "build:packages": "npm run build -w @lootvault/shared",
    "test:shared": "npm test -w @lootvault/shared",
```
Run: `npm install`
Expected: the output shows `> @lootvault/shared@0.1.0 build`, and `packages/shared/dist/index.js` exists.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): EIP-712 checkout types, chain event envelope and id helpers

Constraint: CommonJS build so NestJS/Jest and ESM (Hardhat 3, Next) can all import it
Confidence: high
Scope-risk: low
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `@lootvault/contracts`: `LootVault1155` with 14 behaviour tests

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/hardhat.config.ts`, `packages/contracts/tsconfig.json`
- Test: `packages/contracts/test/LootVault1155.test.ts`
- Create: `packages/contracts/contracts/LootVault1155.sol`
- Modify: `package.json` (root), adding `test:contracts`

**Interfaces:**
- Consumes: `checkoutTypedData`, `CheckoutLine`, `CheckoutMessage` from `@lootvault/shared` (Task 3).
- Produces the contract `LootVault1155`:
  - Constructor `(string baseUri, address initialOwner, address signer, address treasury)`.
  - `purchase(Checkout c, bytes platformSig) payable`.
  - `hashCheckout(Checkout c) view returns (bytes32)`.
  - Public getters `minted(uint256)`, `creatorOf(uint256)`, `usedOrders(bytes32)`, `platformSigner()`, `treasury()`, `feeBps()`.
  - Admin functions `setPlatformSigner`, `setTreasury`, `setFeeBps`, `setURI`, `pause`, `unpause`.
  - Event `Purchased(bytes32 indexed orderId, address indexed buyer, uint256 total, uint256 fee)`.
  - Errors `InvalidSignature`, `WrongBuyer`, `Expired`, `OrderUsed`, `EmptyCheckout`, `CreatorMismatch(uint256)`, `SoldOut(uint256)`, `WrongPayment`, `PayoutFailed`, `FeeTooHigh`, `ZeroAddress`.

- [ ] **Step 1: Write package config**

`packages/contracts/package.json`:
```json
{
  "name": "@lootvault/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test"
  },
  "devDependencies": {
    "@lootvault/shared": "*",
    "@nomicfoundation/hardhat-ignition": "^3.1.8",
    "@nomicfoundation/hardhat-toolbox-viem": "^5.0.7",
    "@openzeppelin/contracts": "^5.6.1",
    "hardhat": "^3.18.1",
    "viem": "^2.57.2"
  }
}
```

`packages/contracts/hardhat.config.ts`:
```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// Single source of local config: the monorepo root .env.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    },
  },
  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: process.env.RPC_URL ?? "http://127.0.0.1:8545",
      accounts: [configVariable("DEPLOYER_KEY")],
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("BASE_SEPOLIA_DEPLOYER_KEY")],
    },
  },
});
```

`packages/contracts/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "noEmit": true,
    "types": ["node"],
    "verbatimModuleSyntax": true
  },
  "include": ["hardhat.config.ts", "test", "scripts"]
}
```

- [ ] **Step 2: Write the failing test suite**

`packages/contracts/test/LootVault1155.test.ts`:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkoutTypedData, type CheckoutLine, type CheckoutMessage } from "@lootvault/shared";
import { network } from "hardhat";
import { getAddress, hashTypedData, keccak256, parseEther, toHex, type Address, type Hex } from "viem";

describe("LootVault1155", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, platform, treasury, creatorA, creatorB, buyer, stranger] = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();
  const PRICE = parseEther("0.01");

  async function deploy() {
    const vault = await viem.deployContract("LootVault1155", [
      "https://media.example/metadata/{id}.json",
      owner.account.address,
      platform.account.address,
      treasury.account.address,
    ]);
    const asBuyer = await viem.getContractAt("LootVault1155", vault.address, { client: { wallet: buyer } });
    const asStranger = await viem.getContractAt("LootVault1155", vault.address, { client: { wallet: stranger } });
    return { vault, asBuyer, asStranger };
  }

  let orderCounter = 0;
  const nextOrderId = (): Hex => keccak256(toHex(`order-${++orderCounter}`));
  const blockTime = async () => (await publicClient.getBlock()).timestamp;

  function line(overrides: Partial<CheckoutLine> = {}): CheckoutLine {
    return { tokenId: 1n, creator: creatorA.account.address, quantity: 1n, unitPrice: PRICE, maxSupply: 5n, ...overrides };
  }

  async function checkout(overrides: Partial<CheckoutMessage> = {}): Promise<CheckoutMessage> {
    return { orderId: nextOrderId(), buyer: buyer.account.address, lines: [line()], deadline: (await blockTime()) + 300n, ...overrides };
  }

  async function sign(vaultAddress: Address, message: CheckoutMessage, signer = platform): Promise<Hex> {
    return signer.signTypedData({ account: signer.account, ...checkoutTypedData(chainId, vaultAddress, message) });
  }

  const totalOf = (c: CheckoutMessage) => c.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0n);

  it("hashCheckout matches the off-chain EIP-712 digest", async () => {
    const { vault } = await deploy();
    const c = await checkout({ lines: [line(), line({ tokenId: 2n, quantity: 3n })] });
    const onChain = await vault.read.hashCheckout([c]);
    assert.equal(onChain, hashTypedData(checkoutTypedData(chainId, vault.address, c)));
  });

  it("mints to the buyer, splits payment 97.5/2.5 and emits Purchased", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [line({ quantity: 2n })] });
    const total = totalOf(c);
    const fee = (total * 250n) / 10_000n;

    const hash = await asBuyer.write.purchase([c, await sign(vault.address, c)], { value: total });

    await viem.assertions.balancesHaveChanged(hash, [
      { address: buyer.account.address, amount: -total },
      { address: creatorA.account.address, amount: total - fee },
      { address: treasury.account.address, amount: fee },
    ]);
    await viem.assertions.emitWithArgs(hash, vault, "Purchased", [c.orderId, getAddress(buyer.account.address), total, fee]);
    assert.equal(await vault.read.balanceOf([buyer.account.address, 1n]), 2n);
    assert.equal(await vault.read.minted([1n]), 2n);
    assert.equal(await vault.read.creatorOf([1n]), getAddress(creatorA.account.address));
  });

  it("pays every creator in a multi-line cart", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({
      lines: [line({ tokenId: 1n, quantity: 1n }), line({ tokenId: 2n, creator: creatorB.account.address, quantity: 2n })],
    });
    const hash = await asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) });

    await viem.assertions.balancesHaveChanged(hash, [
      { address: creatorA.account.address, amount: PRICE - (PRICE * 250n) / 10_000n },
      { address: creatorB.account.address, amount: 2n * PRICE - (2n * PRICE * 250n) / 10_000n },
    ]);
    assert.equal(await vault.read.balanceOf([buyer.account.address, 2n]), 2n);
  });

  it("reverts SoldOut once the supply cap would be exceeded", async () => {
    const { vault, asBuyer } = await deploy();
    const first = await checkout({ lines: [line({ quantity: 3n })] });
    await asBuyer.write.purchase([first, await sign(vault.address, first)], { value: totalOf(first) });

    const second = await checkout({ lines: [line({ quantity: 3n })] });
    await viem.assertions.revertWithCustomErrorWithArgs(
      asBuyer.write.purchase([second, await sign(vault.address, second)], { value: totalOf(second) }),
      vault,
      "SoldOut",
      [1n],
    );
  });

  it("reverts Expired after the deadline", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ deadline: (await blockTime()) - 1n });
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "Expired",
    );
  });

  it("reverts WrongBuyer when someone else submits the checkout", async () => {
    const { vault, asStranger } = await deploy();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asStranger.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "WrongBuyer",
    );
  });

  it("reverts OrderUsed when a signed checkout is replayed", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout();
    const sig = await sign(vault.address, c);
    await asBuyer.write.purchase([c, sig], { value: totalOf(c) });
    await viem.assertions.revertWithCustomError(asBuyer.write.purchase([c, sig], { value: totalOf(c) }), vault, "OrderUsed");
  });

  it("reverts InvalidSignature for a non-platform signer or a tampered price", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c, stranger)], { value: totalOf(c) }),
      vault,
      "InvalidSignature",
    );

    const sig = await sign(vault.address, c);
    const tampered = { ...c, lines: [line({ unitPrice: 1n })] };
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([tampered, sig], { value: totalOf(tampered) }),
      vault,
      "InvalidSignature",
    );
  });

  it("reverts WrongPayment when msg.value differs from the total", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) - 1n }),
      vault,
      "WrongPayment",
    );
  });

  it("reverts CreatorMismatch when a token is sold under a different creator", async () => {
    const { vault, asBuyer } = await deploy();
    const first = await checkout();
    await asBuyer.write.purchase([first, await sign(vault.address, first)], { value: totalOf(first) });

    const hijack = await checkout({ lines: [line({ creator: creatorB.account.address })] });
    await viem.assertions.revertWithCustomErrorWithArgs(
      asBuyer.write.purchase([hijack, await sign(vault.address, hijack)], { value: totalOf(hijack) }),
      vault,
      "CreatorMismatch",
      [1n],
    );
  });

  it("reverts EmptyCheckout for a checkout without lines", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [] });
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: 0n }),
      vault,
      "EmptyCheckout",
    );
  });

  it("blocks purchases while paused", async () => {
    const { vault, asBuyer } = await deploy();
    await vault.write.pause();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "EnforcedPause",
    );
  });

  it("restricts admin functions and validates fee and signer rotation", async () => {
    const { vault, asStranger, asBuyer } = await deploy();
    await viem.assertions.revertWithCustomError(asStranger.write.setFeeBps([100]), vault, "OwnableUnauthorizedAccount");
    await viem.assertions.revertWithCustomError(vault.write.setFeeBps([1001]), vault, "FeeTooHigh");

    await vault.write.setPlatformSigner([stranger.account.address]);
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c, platform)], { value: totalOf(c) }),
      vault,
      "InvalidSignature",
    );
  });

  it("serves ERC-1155 {id} metadata URIs", async () => {
    const { vault } = await deploy();
    assert.equal(await vault.read.uri([1n]), "https://media.example/metadata/{id}.json");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm install && npm test -w @lootvault/contracts`
Expected: FAIL. Hardhat reports that the artifact for `LootVault1155` was not found (`HHE1000`-family "Artifact for contract "LootVault1155" not found"). The test file itself must type-load without import errors.

- [ ] **Step 4: Implement the contract**

`packages/contracts/contracts/LootVault1155.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LootVault1155
/// @notice Lazy-mint ERC-1155 for multi-store NFT shops.
/// @dev Deliberately "dumb": every business rule (price, discounts, per-wallet limits,
///      publish state) lives off-chain and reaches the chain only through a Checkout
///      signed by the platform. The contract enforces just five invariants:
///      platform authorisation, buyer/deadline binding, single-use orderId,
///      per-token supply cap, and exact payment with fee split.
contract LootVault1155 is ERC1155, EIP712, Ownable, Pausable, ReentrancyGuard {
    struct Line {
        uint256 tokenId;
        address creator;
        uint256 quantity;
        uint256 unitPrice;
        uint256 maxSupply;
    }

    struct Checkout {
        bytes32 orderId;
        address buyer;
        Line[] lines;
        uint256 deadline;
    }

    bytes32 private constant LINE_TYPEHASH =
        keccak256("Line(uint256 tokenId,address creator,uint256 quantity,uint256 unitPrice,uint256 maxSupply)");
    bytes32 private constant CHECKOUT_TYPEHASH =
        keccak256(
            "Checkout(bytes32 orderId,address buyer,Line[] lines,uint256 deadline)"
            "Line(uint256 tokenId,address creator,uint256 quantity,uint256 unitPrice,uint256 maxSupply)"
        );

    uint16 public constant MAX_FEE_BPS = 1000; // 10%
    uint16 private constant BPS_DENOMINATOR = 10_000;

    address public platformSigner;
    address public treasury;
    uint16 public feeBps;

    mapping(uint256 tokenId => uint256) public minted;
    mapping(uint256 tokenId => address) public creatorOf;
    mapping(bytes32 orderId => bool) public usedOrders;

    event Purchased(bytes32 indexed orderId, address indexed buyer, uint256 total, uint256 fee);
    event PlatformSignerUpdated(address indexed signer);
    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(uint16 feeBps);

    error InvalidSignature();
    error WrongBuyer();
    error Expired();
    error OrderUsed();
    error EmptyCheckout();
    error CreatorMismatch(uint256 tokenId);
    error SoldOut(uint256 tokenId);
    error WrongPayment();
    error PayoutFailed();
    error FeeTooHigh();
    error ZeroAddress();

    constructor(string memory baseUri, address initialOwner, address signer, address treasury_)
        ERC1155(baseUri)
        EIP712("LootVault", "1")
        Ownable(initialOwner)
    {
        if (signer == address(0) || treasury_ == address(0)) revert ZeroAddress();
        platformSigner = signer;
        treasury = treasury_;
        feeBps = 250; // 2.5%
    }

    /// @notice Buy every line of a platform-signed checkout in one transaction.
    function purchase(Checkout calldata c, bytes calldata platformSig) external payable whenNotPaused nonReentrant {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashCheckout(c), platformSig);
        if (err != ECDSA.RecoverError.NoError || recovered != platformSigner) revert InvalidSignature();
        if (msg.sender != c.buyer) revert WrongBuyer();
        if (block.timestamp > c.deadline) revert Expired();
        if (usedOrders[c.orderId]) revert OrderUsed();
        if (c.lines.length == 0) revert EmptyCheckout();
        usedOrders[c.orderId] = true;

        // Checks + effects for every line before any external call.
        uint256 total;
        for (uint256 i; i < c.lines.length; ++i) {
            Line calldata line = c.lines[i];
            address knownCreator = creatorOf[line.tokenId];
            if (knownCreator == address(0)) {
                creatorOf[line.tokenId] = line.creator;
            } else if (knownCreator != line.creator) {
                revert CreatorMismatch(line.tokenId);
            }
            if (minted[line.tokenId] + line.quantity > line.maxSupply) revert SoldOut(line.tokenId);
            minted[line.tokenId] += line.quantity;
            total += line.quantity * line.unitPrice;
        }
        if (msg.value != total) revert WrongPayment();

        // Interactions: mint (may call onERC1155Received) and pay out.
        uint256 feeTotal;
        for (uint256 i; i < c.lines.length; ++i) {
            Line calldata line = c.lines[i];
            _mint(c.buyer, line.tokenId, line.quantity, "");
            uint256 lineTotal = line.quantity * line.unitPrice;
            uint256 lineFee = (lineTotal * feeBps) / BPS_DENOMINATOR;
            feeTotal += lineFee;
            _pay(line.creator, lineTotal - lineFee);
        }
        _pay(treasury, feeTotal);

        emit Purchased(c.orderId, c.buyer, total, feeTotal);
    }

    /// @notice EIP-712 digest of a checkout; exposed so off-chain code can be cross-checked.
    function hashCheckout(Checkout calldata c) public view returns (bytes32) {
        bytes32[] memory lineHashes = new bytes32[](c.lines.length);
        for (uint256 i; i < c.lines.length; ++i) {
            Line calldata line = c.lines[i];
            lineHashes[i] = keccak256(
                abi.encode(LINE_TYPEHASH, line.tokenId, line.creator, line.quantity, line.unitPrice, line.maxSupply)
            );
        }
        return _hashTypedDataV4(
            keccak256(
                abi.encode(CHECKOUT_TYPEHASH, c.orderId, c.buyer, keccak256(abi.encodePacked(lineHashes)), c.deadline)
            )
        );
    }

    // ---------------------------------------------------------------- admin

    function setPlatformSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        platformSigner = signer;
        emit PlatformSignerUpdated(signer);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function setURI(string calldata newUri) external onlyOwner {
        _setURI(newUri);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayoutFailed();
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @lootvault/contracts`
Expected: `Compiled 1 Solidity file with solc 0.8.28`, followed by 14 ✔ lines under `LootVault1155` and `14 passing`. The first run downloads solc 0.8.28.

- [ ] **Step 6: Add the root script and commit**

Add to the root `package.json` `scripts`:
```json
    "test:contracts": "npm test -w @lootvault/contracts",
```
```bash
git add -A
git commit -m "feat(contracts): LootVault1155 lazy-mint ERC-1155 with platform-signed checkout

Constraint: contract enforces only signature, buyer/deadline, single-use orderId, supply cap, exact payment
Rejected: creator-signed listings | price change/unpublish would need a gas-costing tx
Confidence: high
Scope-risk: low
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Local deployment, ABI export and env sync

**Files:**
- Create: `packages/contracts/scripts/deploy.ts`, `packages/contracts/scripts/export-abi.mjs`
- Create (generated, committed): `packages/shared/src/abi/lootVault1155.ts`
- Modify: `packages/shared/src/index.ts`, adding the ABI export
- Test: `packages/shared/src/abi.test.ts`
- Create: `scripts/sync-deployment-env.mjs`
- Modify: `packages/contracts/package.json` (scripts `build`, `deploy`), root `package.json` (script `deploy:local`)

**Interfaces:**
- Consumes: `upsertEnv` (Task 1), the contract artifact (Task 4), and root `.env` keys `DEPLOYER_KEY`, `PLATFORM_SIGNER_KEY`, `TREASURY_ADDRESS`, `METADATA_BASE_URI`.
- Produces: `lootVault1155Abi` (`as const`) exported from `@lootvault/shared`.
- Produces: `packages/contracts/deployments/<network>.json` with fields `{ network, chainId, address, startBlock, owner, platformSigner, treasury, baseUri, txHash, deployedAt }`.
- Produces: root `.env` keys `CONTRACT_ADDRESS` and `START_BLOCK`, filled in by `npm run deploy:local`.

- [ ] **Step 1: Write the ABI export script and wire `build`**

`packages/contracts/scripts/export-abi.mjs`:
```js
// Copies the compiled ABI into @lootvault/shared as a typed `as const` export.
import { readFileSync, writeFileSync } from "node:fs";

const artifactUrl = new URL("../artifacts/contracts/LootVault1155.sol/LootVault1155.json", import.meta.url);
const outUrl = new URL("../../shared/src/abi/lootVault1155.ts", import.meta.url);

const { abi } = JSON.parse(readFileSync(artifactUrl, "utf8"));
writeFileSync(
  outUrl,
  `// AUTO-GENERATED by packages/contracts/scripts/export-abi.mjs. Do not edit.\n` +
    `export const lootVault1155Abi = ${JSON.stringify(abi, null, 2)} as const;\n`,
);
console.log(`Wrote ${abi.length} ABI entries to ${outUrl.pathname}`);
```

In `packages/contracts/package.json`, set `scripts` to:
```json
  "scripts": {
    "compile": "hardhat compile",
    "build": "hardhat compile && node scripts/export-abi.mjs",
    "test": "hardhat test",
    "deploy": "hardhat run scripts/deploy.ts"
  },
```

- [ ] **Step 2: Write the failing ABI test**

`packages/shared/src/abi.test.ts`:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lootVault1155Abi } from "./index";

describe("lootVault1155Abi", () => {
  const names = lootVault1155Abi.map((entry) => ("name" in entry ? `${entry.type}:${entry.name}` : entry.type));

  it("exposes purchase/hashCheckout and the events the indexer decodes", () => {
    for (const expected of ["function:purchase", "function:hashCheckout", "event:Purchased", "event:TransferSingle"]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
  });

  it("exposes the custom errors the frontend maps to messages", () => {
    for (const expected of ["error:SoldOut", "error:Expired", "error:WrongBuyer", "error:OrderUsed", "error:InvalidSignature"]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
  });
});
```

Run: `npm test -w @lootvault/shared`
Expected: FAIL with tsc error `Module './index' has no exported member 'lootVault1155Abi'`.

- [ ] **Step 3: Generate the ABI and export it**

```bash
mkdir -p packages/shared/src/abi
npm run build -w @lootvault/contracts
```
Expected: `Wrote N ABI entries to .../packages/shared/src/abi/lootVault1155.ts`, with N > 30.

Modify `packages/shared/src/index.ts` so it reads:
```ts
export * from "./abi/lootVault1155";
export * from "./eip712";
export * from "./events";
export * from "./ids";

export const LOCAL_CHAIN_ID = 31337;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
```

Run: `npm test -w @lootvault/shared`
Expected: `# pass 11`, `# fail 0`.

- [ ] **Step 4: Write the deploy script**

`packages/contracts/scripts/deploy.ts`:
```ts
// Deploys LootVault1155 to the network given by --network and records the result
// in deployments/<network>.json (address + start block for the indexer).
import { mkdirSync, writeFileSync } from "node:fs";

import { network } from "hardhat";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name} (see .env.example)`);
  return value;
}

const { viem, networkName } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const platformSigner = privateKeyToAccount(required("PLATFORM_SIGNER_KEY") as Hex).address;
const treasury = getAddress(required("TREASURY_ADDRESS"));
const baseUri = required("METADATA_BASE_URI");

const { contract, deploymentTransaction } = await viem.sendDeploymentTransaction("LootVault1155", [
  baseUri,
  deployer.account.address,
  platformSigner,
  treasury,
]);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash });

const deployment = {
  network: networkName,
  chainId: await publicClient.getChainId(),
  address: contract.address,
  startBlock: Number(receipt.blockNumber),
  owner: deployer.account.address,
  platformSigner,
  treasury,
  baseUri,
  txHash: deploymentTransaction.hash,
  deployedAt: new Date().toISOString(),
};

const dir = new URL("../deployments/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`${networkName}.json`, dir), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(JSON.stringify(deployment, null, 2));
```

- [ ] **Step 5: Write the env sync script and the root `deploy:local` script**

`scripts/sync-deployment-env.mjs`:
```js
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
```

Add to the root `package.json` `scripts`:
```json
    "deploy:local": "npm run deploy -w @lootvault/contracts -- --network localhost && node scripts/sync-deployment-env.mjs localhost",
```

- [ ] **Step 6: Deploy to the docker chain and verify end-to-end**

Run: `npm run infra:up && npm run deploy:local`
Expected:
- The output is JSON with `"network": "localhost"`, `"chainId": 31337` and a `0x…` address.
- `"platformSigner": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"` and `"treasury": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"`.
- The last line is `.env updated: CONTRACT_ADDRESS=0x… START_BLOCK=…`.

Run: `npm run doctor`
Expected: every check ✔, including `LootVault1155 deployed — 0x…`, then `All checks passed.` and exit code 0.

Run (persistence of the deployed contract):
```bash
sleep 6 && docker compose restart chain && sleep 3 && npm run doctor
```
Expected: `All checks passed.` The contract survives the chain restart.

- [ ] **Step 7: Run every test suite**

Run: `npm run test:scripts && npm run test:shared && npm run test:contracts`
Expected: 4 + 11 + 14 tests passing, 0 failing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(contracts): deploy script, ABI export to shared, .env sync for local chain

Constraint: generated ABI is committed so services build without compiling Solidity
Confidence: high
Scope-risk: low
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Done criteria for Plan 1

- `npm run infra:up && npm run deploy:local && npm run doctor` passes on a clean clone after `cp .env.example .env && npm install`.
- `npm run test:scripts && npm run test:shared && npm run test:contracts` pass with 29 tests.
- Chain state, including the deployed contract, survives `docker compose restart chain`.
- Plan 2 can import `@lootvault/shared` and get `checkoutTypedData`, `lootVault1155Abi`, `EVENT_TYPES`, `eventId`, `tokenIdFromItemId` and `metadataFileName`.
