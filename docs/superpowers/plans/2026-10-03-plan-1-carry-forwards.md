# Plan 1: carry-forwards and decision record

Plan 1 (foundation, contract, shared) was executed with subagent-driven development on `feat/plan-1-foundation`. This file keeps what the execution ledger learned, so Plans 2–4 build on it after the scratch ledger is deleted.

## State at the end of Plan 1

- **Tests:** 45 green.

  | Suite | Tests |
  |---|---|
  | scripts | 4 |
  | shared | 11 |
  | contracts | 30 (incl. ABI drift guard) |

- **Local contract:** deployed at the address in `packages/contracts/deployments/localhost.json` (gitignored) and synced to `.env`. `npm run doctor` passes all checks.
- **Contract behaviour beyond the original spec:**
  - `maxSupplyOf` and `creatorOf` are fixed at first sale.
  - `EditionLocked` event.
  - `InvalidLine` error.
  - `Ownable2Step`, with `renounceOwnership` disabled.

## Decisions made during execution (rulings)

1. **Branch, not worktree.** Work happened on `feat/plan-1-foundation` in the main checkout. It is a fresh personal repo, so a worktree would only duplicate node_modules and Docker volumes.
2. **`.omc/` is gitignored.** The OMC plugin writes session state into the repo root, and it had leaked into early commits. It was untracked in `0a6027c`.
3. **Every shell runs `nvm use`.** It selects Node 22.16 from `.nvmrc`. The default shell has Node 20.18, which Hardhat 3 refuses.
4. **`Co-Authored-By` names the model that actually wrote each commit.** That is not the plan's literal string.
5. **doctor and compose were hardened in Task 2.**
   - doctor gives actionable errors: cause codes, an "`npm run infra:up`" hint, cwd-independent checks, and 5s fetch timeouts.
   - **All ports bind to 127.0.0.1 only**, because Mongo has no auth and anvil uses public keys.
6. **Module resolution for `@lootvault/shared`.**
   - Task 3: `node10`, because `node16` rejects CJS imports of ESM-typed viem.
   - The final review showed `nodenext` works on TS 5.9.3, so the final fix wave switched shared to **`nodenext`**.
7. **New Task 5: contract hardening.** Spec §4 claimed the supply cap limits damage from a leaked platform key, but `maxSupply` is signer-chosen. The fix makes the edition size and creator fixed at first sale (first write wins). As a result, catalog may edit supply only while `sold == 0` (`409 SUPPLY_LOCKED`).
8. **Final-review fix wave.**
   - Contract: two-step ownership, renounce disabled, `EditionLocked` event.
   - Tests: cross-vault signature, lower or different caps, EditionLocked emitted once, ownership, non-owner admin calls.
   - Build: ABI drift-guard test, and the contracts build now rebuilds shared; shared builds clean with `rm -rf dist`.
   - Deploy safety: the deploy script reads `PLATFORM_SIGNER_ADDRESS`, never the key, and refuses anvil accounts or localhost URIs on public chains.
   - anvil gets `stop_signal: SIGINT`.
9. **Accepted:** `renounceOwnership` is declared `view`. Every call still reverts; only the ABI looks unusual.

## Plan 2 must do (backend)

### First task: wire formats in `@lootvault/shared`
- **`CheckoutWire` plus `toWire`/`fromWire`.** bigints become decimal strings; `JSON.stringify` of a `CheckoutMessage` throws.
- **One tokenId rule.**
  - **Decimal string** everywhere: DB, events and API. Document it on `TransferSingleData.id`.
  - Add `tokenIdHex64()` and `metadataKey()` returning `metadata/<hex64>.json`. Do not combine `metadataFileName` with the `{id}.json` template; that produces `.json.json`.
- **Lowercase addresses** in the envelope and the DB.
- **A single pure `toChainEvent(log, { chainId, blockTimestamp })`**, used by both the order-svc fast-path and the indexer, so both paths produce identical events and ids.
- **`itemIdFromTokenId` range check.** Consumers treat unknown or out-of-range tokenIds as a no-op, not as poison messages.

### Bootstrap and local lifecycle
- **Split bootstrap into idempotent steps:**

  | Step | Behaviour |
  |---|---|
  | `aws:init` | Creates the bucket (CORS, public-read prefixes), topic, queues + DLQs, and subscriptions with filter policies. moto state is in-memory, so this must be safe to rerun after any Docker restart |
  | Guarded `deploy:local` | Skips if `deployments/localhost.json` has code on-chain. `--force` redeploys |
  | `seed` | Runs only if the DB is empty |

- **doctor checks to add:**
  - bucket, topic and queues exist;
  - Mongo reached through `MONGO_URL` with the driver, with a timeout;
  - on-chain `platformSigner()` equals the address of `PLATFORM_SIGNER_KEY`;
  - `.env` keys compared against `.env.example`, because older `.env` files lack `PLATFORM_SIGNER_ADDRESS`.

### Catalog
- Take the edition size from **`EditionLocked`** and write it into `items.supply`, since the chain is the source of truth.
- Refuse supply edits when `sold > 0`, or while a live PENDING order contains the item.
- `sold` comes from `TransferSingle` mints (`from == 0x0`).

### Indexer
- `START_BLOCK` is the **inclusive** deploy block, so the cursor starts at `START_BLOCK − 1`.
- If `getLogs` lacks `blockTimestamp`, fall back to `getBlock`.
- Decode `EditionLocked` and `TransferSingle` for catalog, and `Purchased` for order.
- `TransferBatch` is not indexed. Either document it as a known limitation in the playbook, or handle it.

### Order and frontend
- Map `PayoutFailed`, `SoldOut`, `Expired` and `InvalidLine` to readable messages.

## Plan 4 must do (AWS, Base Sepolia)
- Amplify build image on **Node ≥22**, because of `engine-strict`.
- The root `postinstall` needs TypeScript. It breaks `--omit=dev` installs and partial Docker/Lambda copies; give Lambda builds their own path.
- **Before any public deploy:**
  - Extend the deploy guard to refuse an anvil **deployer/owner** key.
  - Make the URI guard case-insensitive and also cover `0.0.0.0`, `[::1]` and `host.docker.internal`.
- Check the RPC provider's `getLogs` block-range limit against `BATCH=500`.

## Deferred minors (accepted for now)
- **`upsertEnv`:** duplicate keys, `export KEY=`, CRLF and newline-in-value are not handled. Tests leave temp dirs behind.
- **anvil image:** the tarball is not checksum-verified, the image runs as root, and the version is defined in two places.
- **doctor:** relies on undici's "fetch failed" wording. Mongo reports only the first stderr line.
- **Tests:**
  - The shared digest test checks shape only; the contract cross-check covers this.
  - No reentrancy-attack test.
  - A successful duplicate-token cart is not tested for emitting `EditionLocked` once.
  - A non-owner `renounceOwnership` call is not tested.
  - `transferOwnership(0)` (cancel) is not tested.
- **Contract polish:** gas nits (`tryRecoverCalldata`, caching `feeBps`); constructor param `baseUri` actually takes the full `{id}` template.
- **Scripts:** `sync-deployment-env` prints a raw ENOENT; the generated ABI is not Prettier-formatted.
