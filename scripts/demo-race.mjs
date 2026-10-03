#!/usr/bin/env node
// Oversell demo: 20 wallets race for the last 5 copies. The soft stock check at checkout is
// best-effort under concurrency; the contract's supply cap is the hard guarantee.
import { lootVault1155Abi } from "@lootvault/shared";
import { toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { ACCOUNTS } from "./lib/accounts.mjs";
import { api, ensureStore, env, login, payCheckout, publicClient, uploadPng, URLS, waitFor } from "./lib/api.mjs";
import { renderCardPng } from "./lib/png.mjs";

const BUYERS = 20;
const SUPPLY = 5;

const publisherToken = await login(ACCOUNTS.racePublisher);
await ensureStore(publisherToken, { slug: "race-arena", name: "Race Arena", description: "Created by demo:race" });
const item = await api(URLS.catalog, "/catalog/items", {
  method: "POST",
  token: publisherToken,
  body: { name: `Last Five ${Date.now()}`, imageUrl: await uploadPng(publisherToken, renderCardPng({ hue: 0 })), supply: SUPPLY, priceWei: (10n ** 15n).toString() },
});
await api(URLS.catalog, `/catalog/items/${item.id}/publish`, { method: "POST", token: publisherToken });
console.log(`Item "${item.name}" — supply ${SUPPLY}, ${BUYERS} buyers racing\n`);

const buyers = Array.from({ length: BUYERS }, () => privateKeyToAccount(generatePrivateKey()));
for (const buyer of buyers) {
  await publicClient.request({ method: "anvil_setBalance", params: [buyer.address, toHex(10n ** 18n)] });
}
const tokens = await Promise.all(buyers.map((buyer) => login(buyer, "localhost:3100")));

// 1. Everyone checks out at the same moment.
const checkouts = await Promise.allSettled(
  buyers.map((_, i) =>
    api(URLS.orders, "/orders/checkout", { method: "POST", token: tokens[i], body: { lines: [{ itemId: item.id, quantity: 1 }] } }),
  ),
);
const signed = checkouts.flatMap((result, i) => (result.status === "fulfilled" ? [{ i, ...result.value }] : []));
const rejected = checkouts.filter((result) => result.status === "rejected");
console.log(`checkout  : ${signed.length} signed, ${rejected.length} rejected (${[...new Set(rejected.map((r) => r.reason.code))].join(", ")})`);

// 2. Every signed buyer pays at the same moment (gas fixed so doomed txs are still mined and revert on-chain).
const sent = await Promise.allSettled(signed.map((s) => payCheckout(buyers[s.i], s.purchase, { gas: 500_000n })));
const receipts = await Promise.all(
  sent.map((result) => (result.status === "fulfilled" ? publicClient.waitForTransactionReceipt({ hash: result.value }) : null)),
);
const paid = signed.filter((_, k) => receipts[k]?.status === "success");
console.log(`on-chain  : ${paid.length} purchases succeeded, ${signed.length - paid.length} reverted (SoldOut)`);

// 3. Winners confirm via the fast-path; the indexer would deliver the same events anyway.
await Promise.all(
  paid.map((s) => {
    const k = signed.indexOf(s);
    return api(URLS.orders, `/orders/${s.order.id}/confirm`, { method: "POST", token: tokens[s.i], body: { txHash: receipts[k].transactionHash } });
  }),
);

const minted = await publicClient.readContract({ address: env.CONTRACT_ADDRESS, abi: lootVault1155Abi, functionName: "minted", args: [BigInt(item.tokenId)] });
const final = await waitFor("catalog projection", async () => {
  const current = await api(URLS.catalog, `/catalog/items/${item.id}`);
  return current.sold === Number(minted) ? current : undefined;
});
const sales = await api(URLS.orders, `/orders/recent-sales?itemId=${item.id}&limit=20`);

console.log(`\n  on-chain minted     : ${minted}`);
console.log(`  catalog sold        : ${final.sold} (remaining ${final.remaining})`);
console.log(`  orders PAID for item: ${sales.length}`);

const ok = Number(minted) === SUPPLY && final.sold === SUPPLY && sales.length === SUPPLY;
console.log(ok ? "\nRACE DEMO PASSED: exactly 5 sold, database matches chain" : "\nRACE DEMO FAILED");
process.exit(ok ? 0 : 1);
