# Plan 2: carry-forwards and decision record

Plan 2 (backend MVP) was executed with subagent-driven development on `feat/plan-2-backend`. Every task was implemented, then reviewed, then sent back for fixes where needed, and a final whole-branch review closed it out. The execution ledger is gitignored scratch, so this file keeps what Plans 3 and 4 must know.

## State at the end of Plan 2

- **Four services:** auth (SIWE + JWT), catalog, order and indexer. Two shared packages: `@lootvault/shared` and `@lootvault/nest-common`. Ops scripts and a README.
- **Real-stack gate** (`npm run doctor`, `seed`, `demo:smoke`, `demo:race`) is green.
  - The race sends 20 buyers after 5 copies.
  - Exactly 5 win, and minted = catalog `sold` = `PAID` orders = 5.
- **Tests:** 186 green.

  | Suite | Tests |
  |---|---|
  | scripts | 15 |
  | shared | 20 |
  | nest-common | 42 |
  | auth | 6 |
  | catalog | 22 |
  | order | 43 |
  | indexer | 8 |
  | contracts | 30 |

## Decisions made during execution (rulings)

1. **The scratch spike came first.** Every plan code block was executed in a scratch clone before the plan was written. Implementers transcribed the blocks, and review and fix rounds then hardened them. Wherever the repo differs from the plan text, the difference is a ruling listed below.
2. **Inbox duplicates.** Only a collision on the inbox key counts as a duplicate, via a `DuplicateEventError` sentinel. A handler's own E11000 is rethrown so the message is retried and the event is not lost. `processed_events` has a 30-day TTL, which is longer than SQS's 14-day maximum retention.
3. **Holding balances are commutative upserts.** Both debit and credit use `$inc`. The catalog queue is standard SQS rather than FIFO, so balances must converge whatever the delivery order. A malformed tokenId or value is a no-op, not a poison message.
4. **LIVE metadata is written before the database save.** A failed S3 write leaves nothing persisted, so a retry rewrites it. `imageUrl` must live under `${MEDIA_PUBLIC_URL}/media/` (`400 IMAGE_NOT_HOSTED`), so on-chain-referenced metadata can only point at platform-hosted media.
5. **Checkout hoarding cap.** A buyer may hold at most `MAX_PENDING_ORDERS_PER_BUYER` open checkouts (default 3, `429 TOO_MANY_PENDING_ORDERS`). This is a soft limit (count, then create), so it can be bypassed with many wallets, but a reservation lasts at most `CHECKOUT_TTL_SECONDS`. The on-chain cap is the hard guarantee.
6. **One finality rule.** order-svc's fast path and the indexer share the `CONFIRMATIONS` key. The fast path answers `202 PENDING_TX` and publishes nothing until the receipt is deep enough.
7. **Both payment paths check the total.** The fast path and the `Purchased` consumer both compare the paid total with `order.totalWei`. A mismatch is `422 TX_MISMATCH` on the fast path and a logged skip on the consumer.
8. **The chain locks the supply.** `EditionLocked` sets `items.supply` and `editionLocked`. Supply edits are refused once `sold > 0 || editionLocked`.
   - Accepted: a publisher can shrink supply while a signed checkout is open. The first sale then locks the edition at the signed `maxSupply`, and `EditionLocked` brings catalog back in line with the chain. The data stays consistent, but the publisher's edit is visibly reverted.
9. **Local-only scripts refuse non-local targets.** deploy, seed and the demos require a loopback RPC with chainId 31337, and `aws-init`/`dlq:redrive` require a loopback AWS endpoint.
10. **Recovery path.** `npm run dlq:redrive` moves dead-lettered events back to their source queue. Replays are safe because of the inbox. doctor fails while a DLQ is non-empty, and the indexer warns when its cursor is ahead of the chain (chain reset).
11. **Optional auth on public routes.** An invalid or expired token is treated as anonymous rather than rejected with 401.
12. **Not built:** spec §9's `npm run reset`. Running `infra:reset`, `bootstrap`, `dev` and `seed` (all in the README) covers it.

## Plan 3 must do (Studio + Storefront UI)

- **Readable revert messages.** Map these contract errors in `web-shared`: `SoldOut`, `Expired`, `InvalidLine`, `PayoutFailed`, `WrongPayment`, `OrderUsed`, `InvalidSignature`, `WrongBuyer`, `CreatorMismatch`, `EmptyCheckout` and `EnforcedPause`. Also map the wallet's `UserRejected` (spec §6). Carried from Plan 1, because the backend never sees reverts.
- **Order API error codes the UI must handle:**
  - `429 TOO_MANY_PENDING_ORDERS`, with `details.max`. Show "finish or wait for your open checkouts".
  - `409 INSUFFICIENT_STOCK`, with `details.available`.
  - `409 ITEM_UNAVAILABLE`.
  - `400 MIXED_STORES`. The cart is single-store per order.
  - `503 CATALOG_UNAVAILABLE`. Retry.
  - `202 PENDING_TX` on confirm. Poll `GET /orders/:id` until `PAID`.
- **Catalog item errors:** `409 SUPPLY_LOCKED` and `400 IMAGE_NOT_HOSTED`. Images always go through the presign upload.
- **Avoid client-side drift.** Consider moving the internal item wire type into `@lootvault/shared` as `CatalogItemWire`. It is currently typed twice, in order-svc `domain/catalog-item.ts` and catalog-svc `items.service.ts`.
- **Holdings.** "My collection" reads `GET /catalog/holdings/:address`, which is filtered to `balance > 0` and is not paginated yet. Add pagination if the UI needs it.

## Plan 4 must do (AWS, Base Sepolia)

These are in addition to the Plan 1 list, which still applies.

- **Chain and finality**
  - Set `CONFIRMATIONS=3` or more on Base Sepolia.
  - Assert at startup that the RPC's chainId equals `CHAIN_ID`, in order-svc and indexer-svc.
  - Check the RPC provider's `getLogs` range limit against `BATCH_SIZE`.
- **SIWE before a public deploy.** Spec §5.1 requires checking domain, `uri` and chainId. Domain and chainId are checked, but the `uri`/scheme is not. Check it, and refuse to boot when `SIWE_ALLOWED_DOMAINS` is empty.
- **Secrets**
  - Generate `JWT_SECRET` and `INTERNAL_API_KEY`. `.env.example` ships fixed dev placeholders.
  - Use Secrets Manager or SSM for `PLATFORM_SIGNER_KEY`.
  - Never use anvil keys anywhere.
- **Edge**
  - Never route `/catalog/internal/*` through the public API Gateway.
  - Replace `origin: true` CORS (`configure-app.ts`) with an allowlist of the Studio and Storefront origins.
  - Throttle `/orders/checkout`, `/orders/:id/confirm`, `/auth/nonce` and the media presign.
- **Async pipeline**
  - Lambda SQS triggers replace `SqsPoller`; keep the DLQ at `maxReceiveCount` 5.
  - Add a CloudWatch alarm on DLQ depth, since doctor does this locally.
  - Replays older than the 30-day inbox TTL would re-apply catalog `$inc`s. Those need a projection rebuild, not a re-scan.
- **Indexer**
  - Consider storing `lastBlockHash` and verifying it each tick, to detect reorgs deeper than `CONFIRMATIONS` and chain resets.
  - Expose lag on `/indexer/health`.
- **Ops**
  - Make doctor check Mongo through `MONGO_URL` with the driver, not `docker exec`.
  - Make doctor compare the on-chain `uri(0)` with `${MEDIA_PUBLIC_URL}/metadata/{id}.json`, because `METADATA_BASE_URI` and `MEDIA_PUBLIC_URL` can drift apart.

## Deferred minors (accepted for now)

- **shared**
  - `toChainEvents` does not drop `removed: true` logs. This only matters for subscriptions; the indexer uses getLogs.
  - `tokenIdHex64` and `metadataKey` have no uint256 range check.
- **nest-common**
  - `createTestApp` is not hermetic: it fills omitted keys from the dev `.env`.
  - In isolation, the nest-common internal-key guard returns 401 when the key is unset. Catalog and order still fail at startup without it, because their config requires it.
  - `SqsPoller.stop()` and the poison-message path are not unit-tested.
  - The 1s error backoff cannot be aborted.
- **auth**
  - These cases are untested: `SIWE_EXPIRED`, `SIWE_MALFORMED`, expired nonce, cross-address nonce, and concurrent verify.
  - The nonce uses viem's `uid` (Math.random).
  - Only EOAs are supported (no EIP-1271/6492).
  - An empty `SIWE_ALLOWED_DOMAINS` boots without any warning.
  - `signature` has no MaxLength.
- **catalog**
  - The holdings controller is untested and unpaginated.
  - Presign is open to any JWT holder.
  - Trailing slashes in `MEDIA_PUBLIC_URL` and `STOREFRONT_URL` are not normalised.
  - `inStock=1` is silently treated as false.
  - When `SQS_POLLING=true` is set without `CATALOG_QUEUE_URL`, the service runs but never consumes, and logs no warning.
- **order**
  - The `receipt.to` check rejects account-abstraction wallets on the fast path; the consumer path recovers them.
  - RPC errors return 500, not 503.
  - An orphan PENDING order is left behind if signing fails.
  - `last7Days` values are untested.
  - Some e2e tests depend on running in order.
  - Cart-rule tests miss the accept boundaries.
- **indexer**
  - It calls `getBlock` per block even when `log.blockTimestamp` is present.
  - Backoff is fixed rather than exponential.
  - A viem error may include the RPC URL.
- **scripts**
  - The demo `fetch` calls have no `AbortSignal` timeouts.
  - doctor's env check reads `process.env`.
  - seed skips when any store exists, so running smoke or race first means no seed.
  - `api.mjs` drops `error.details`.
  - smoke does not assert stats.
