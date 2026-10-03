#!/usr/bin/env node
// End-to-end smoke test of the running stack: publish -> checkout -> pay on-chain -> confirm -> projections.
import { lootVault1155Abi, metadataKey } from "@lootvault/shared";

import { ACCOUNTS } from "./lib/accounts.mjs";
import { api, ensureStore, env, login, payCheckout, publicClient, uploadPng, URLS, waitFor } from "./lib/api.mjs";
import { renderCardPng } from "./lib/png.mjs";

const step = (message) => console.log(`✔ ${message}`);

for (const [name, base] of Object.entries(URLS)) {
  await api(base, `/${name === "orders" ? "orders" : name}/health`);
}
step("all four services are healthy");

// Publisher: store + item + publish
const publisher = ACCOUNTS.smokePublisher;
const publisherToken = await login(publisher);
const store = await ensureStore(publisherToken, { slug: "smoke-test", name: "Smoke Test", description: "Created by demo:smoke" });
const imageUrl = await uploadPng(publisherToken, renderCardPng({ hue: Date.now() % 360 }));
const itemName = `Smoke Card ${Date.now()}`;
const created = await api(URLS.catalog, "/catalog/items", {
  method: "POST",
  token: publisherToken,
  body: { name: itemName, description: "smoke", imageUrl, supply: 3, priceWei: (10n ** 15n).toString() },
});
await api(URLS.catalog, `/catalog/items/${created.id}/publish`, { method: "POST", token: publisherToken });
step(`publisher ${publisher.address} published "${itemName}" in /s/${store.slug}`);

const metadata = await (await fetch(`${env.MEDIA_PUBLIC_URL}/${metadataKey(BigInt(created.tokenId))}`)).json();
if (metadata.name !== itemName) throw new Error(`metadata mismatch: ${JSON.stringify(metadata)}`);
step("ERC-1155 metadata is served from object storage");

const found = await api(URLS.catalog, `/catalog/stores/${store.slug}/items?q=${encodeURIComponent(itemName.split(" ").pop())}`);
if (!found.items.some((item) => item.id === created.id)) throw new Error("storefront search did not find the item");
step("storefront search finds it");

// Buyer: checkout -> pay -> confirm
const buyer = ACCOUNTS.smokeBuyer;
const buyerToken = await login(buyer, "localhost:3100");
const { order, purchase } = await api(URLS.orders, "/orders/checkout", {
  method: "POST",
  token: buyerToken,
  body: { lines: [{ itemId: created.id, quantity: 2 }] },
});
step(`checkout signed by the platform (order ${order.orderId.slice(0, 10)}…, ${purchase.value} wei)`);

const txHash = await payCheckout(buyer, purchase);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") throw new Error(`purchase reverted: ${txHash}`);
step(`paid on-chain in block ${receipt.blockNumber}`);

const confirmed = await api(URLS.orders, `/orders/${order.id}/confirm`, { method: "POST", token: buyerToken, body: { txHash } });
if (confirmed.status !== "PAID") throw new Error(`confirm returned ${JSON.stringify(confirmed)}`);
step("fast-path confirm: order PAID");

const item = await waitFor("catalog sold count", async () => {
  const current = await api(URLS.catalog, `/catalog/items/${created.id}`);
  return current.sold === 2 ? current : undefined;
});
step(`catalog projection: sold ${item.sold}/${item.supply}, remaining ${item.remaining}`);

const holdings = await api(URLS.catalog, `/catalog/holdings/${buyer.address}`);
if (!holdings.some((h) => h.tokenId === created.tokenId && h.balance === 2)) throw new Error("holdings missing");
step("buyer's collection shows 2 copies");

const balance = await publicClient.readContract({
  address: env.CONTRACT_ADDRESS,
  abi: lootVault1155Abi,
  functionName: "balanceOf",
  args: [buyer.address, BigInt(created.tokenId)],
});
if (balance !== 2n) throw new Error(`on-chain balance ${balance}`);
step("on-chain balanceOf matches");

const stats = await api(URLS.orders, "/orders/store/me/stats", { token: publisherToken });
step(`seller stats: ${stats.ordersPaid} paid order(s), net ${stats.netWei} wei`);

await waitFor("indexer to pass the purchase block", async () => {
  const health = await api(URLS.indexer, "/indexer/health");
  return health.lastBlock >= Number(receipt.blockNumber);
});
step("indexer caught up past the purchase block");

console.log("\nSMOKE TEST PASSED");
