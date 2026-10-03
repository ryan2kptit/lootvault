# Plan 3: carry-forwards and decision record

Plan 3 (the Studio and Storefront web UI) was executed with subagent-driven development on `feat/plan-3-ui`. The steps were:
1. A UI spike in a scratch worktree, verified in a real browser against the running backend.
2. A plan generated from that verified code.
3. Each task implemented, reviewed, and sent through fix rounds where needed.
4. A whole-branch review, then one final fix wave.

The execution ledger is gitignored scratch. This file keeps what Plan 4 (AWS) and the interview playbook need.

## State at the end of Plan 3

- **Apps:** `apps/studio` (:3000) and `apps/storefront` (:3100), both Next.js 16.3 App Router. They share `packages/web-shared`.
- **Gate:** `npm run build` and `npm run typecheck` pass, and `npm test` passes 255 tests. `npm run doctor` now also checks both apps.

  | Suite | Tests |
  |---|---|
  | scripts | 15 |
  | shared | 20 |
  | web-shared | 69 |
  | nest-common | 42 |
  | auth | 6 |
  | catalog | 22 |
  | order | 43 |
  | indexer | 8 |
  | contracts | 30 |
- **Real-browser acceptance walkthrough on the branch.** It covered:
  - Studio as Buyer 2: an account switch dropped the old session, then SIWE sign-in, onboarding with a logo upload and an auto slug, creating an item with artwork, and publishing it.
  - Storefront as Buyer 1: a store page, then a cart of 2. A publisher price change mid-cart stopped checkout with "Prices changed", and no transaction was sent. Checking out again reached Paid, and `/me` updated.
  - Studio dashboard: gross, net and a non-zero fee, plus the chart and recent sales.

## Decisions made during execution (rulings)

1. **Next.js 16.3 rather than the spec's 15.** It is the current stable release and has the same App Router model. `params` and `searchParams` are Promises. `error.tsx` uses the `retry` prop, which is stable in 16.3. `agentRules: false` stops `next dev` from writing AGENTS.md/CLAUDE.md.
2. **UI copy is in English.** The spec's Vietnamese strings are mapped to English.
3. **SSR uses per-service URLs** (`AUTH_URL`, `CATALOG_URL`, `ORDER_URL`) rather than a single `API_INTERNAL_URL`. The browser calls same-origin `/api/<service>/*`, which Next rewrites. Internal routes and `docs` routes are not rewritten.
4. **The demo wallet is a custom wagmi connector, not `mock`.** It can switch roles and it reconnects after a reload. It exists only on chain 31337, where anvil signs for its public dev accounts.
5. **The session is bound to the wallet.**
   - The JWT is stored under `lv:<app>:jwt` and is sent only while the connected address matches the session.
   - The session clears on any of: an account switch, sign-out, a 401, or expiry (a timer at `expiresAt`). Clearing it also resets private query data.
6. **Money safety in `usePurchase`.**
   - If the server's checkout total differs from the total the buyer was shown, the flow stops before the wallet step and refreshes the prices.
   - The contract call is simulated before it is written.
   - The wallet is switched to the checkout chain first.
   - Once the transaction hash exists, the purchased lines leave the persisted cart. They come back only if a receipt is read and says `reverted`.
   - The confirm step polls on a 202. A slow confirmation ends as "submitted", which is a non-retryable state.
7. **Cart rules.** There is one cart per store, under the localStorage key `cart:<slug>`. A cart holds at most 10 lines and at most 10 copies per line. A NaN or corrupt quantity is dropped when the cart rehydrates.
8. **Accessibility baseline.** Focus is shown with a visible outline. Badges use AA-contrast text tokens in light and dark themes. The purchase stepper, loading states and form errors are announced through `aria-current`, `role=status` and `role=alert`.
9. **Testing.** There are no automated UI tests (spec §2). The pure logic in web-shared has vitest unit tests: API errors, http, formatting, revert messages, the cart (including the negative-add path that the double-pay guarantee relies on), and session token and expiry.

## Plan 4 must do (AWS, Base Sepolia)

This list is in addition to the Plan 1 and Plan 2 lists.

- **Build per environment.** `NEXT_PUBLIC_*` values are inlined at build time, so build once per environment. Never put a keyed RPC URL in `NEXT_PUBLIC_RPC_URL`.
- **Pin the contract and chain on the client.** Add `NEXT_PUBLIC_CONTRACT_ADDRESS` and assert that `tx.contract` and `tx.chainId` from checkout match it. Chain is already asserted.
- **Security headers.** Add CSP and `frame-ancestors`, because the JWT is in localStorage. Consider `X-Content-Type-Options` and `Referrer-Policy`.
- **Routing.** On Amplify or CloudFront, map `/api/*` to API Gateway with the same denylist of `internal/*` and `docs`, or drop the rewrites and call API Gateway with a CORS allowlist.
- **Images.** Store `logoUrl` is only `@IsUrl` on the backend. Apply the same hosted-media rule as item images before going public. Configure the S3 public URL and its CORS for the deployed web origins.
- **Wallet.** On Base Sepolia the injected wallet is the only connector. Test the switch-network flow with MetaMask. The demo wallet disappears because the chainId is not 31337.

## Deferred minors (accepted for now)

- **web-shared**
  - A 2xx response with an unparseable body becomes `undefined`.
  - The network-error catch is wider than network failures.
  - `MESSAGES` is not read with `Object.hasOwn`.
  - `formatDateTime` has no fixed timeZone; it is only used after sign-in or on the server.
  - There is no cross-tab sync for the session or the cart.
  - SIWE `expirationTime` is unused.
  - The dropdown lacks Escape handling and `aria-haspopup`.
  - Sign-out is client-only.
- **Studio**
  - Inline errors stay until the next submit.
  - Publishing remounts the edit form, so unsaved edits are lost.
  - `slugify` can end in a dash after slicing.
  - A price longer than 30 digits produces a raw validation error.
  - Client pages have no per-page titles.
  - Some nits remain in the orders filter and chart.
  - `ImageUpload` needs an accessible name.
- **Storefront**
  - Cancelled or price-changed checkouts leave PENDING orders, which can lead to a 429.
  - A page number past the end is a dead end.
  - Buying the last copy hides the done stepper.
  - The `/me` tabs lack ARIA roles.
  - `server-api.ts` has no `import "server-only"`.
  - The `store-filters` pure functions have no unit tests.
  - `/me` collection links can 404 for items that were later unpublished.
  - A restore after a revert can drop lines beyond the 10-line cap.
- **Shared types:** the internal item wire type is typed twice, in catalog and in order. Moving it to `@lootvault/shared` as `CatalogItemWire` is deferred. web-shared separately mirrors the public item view (`Item`/`PublicItem`).
- **Session and API edge cases**
  - `getToken` does not require wagmi status `connected`, so it can send a token during the reconnect window.
  - Path segments (`holdings/:address`, item and order ids) are not encoded with `encodeURIComponent` everywhere.
  - The expiry timer can fire late after the laptop sleeps. A fix is to re-check on `visibilitychange`, or to clear a no-longer-live session inside `getToken`.
  - The clamp at 2^31−1 ms would end sessions longer than 24.8 days early. The current TTL is 2h.
- **Rewrites:** percent-encoded paths such as `%69nternal` and `%64ocs` pass the `/api` rewrite deny rule and reach the service. They 404 there only because Express does not decode paths before matching routes. Plan 4's gateway must deny them by decoded path.
