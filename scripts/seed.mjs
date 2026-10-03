#!/usr/bin/env node
// Seeds two stores with six published NFTs each, through the public APIs (services must be running).
// Skips when stores already exist unless --force.
import { ACCOUNTS } from "./lib/accounts.mjs";
import { api, ensureStore, login, uploadPng, URLS } from "./lib/api.mjs";
import { renderCardPng } from "./lib/png.mjs";

const MILLI = 10n ** 15n; // 0.001 ETH in wei

const STORES = [
  {
    account: ACCOUNTS.publisherA,
    store: { slug: "pixel-legends", name: "Pixel Legends", description: "Hand-drawn creature cards from the Pixel Legends TCG." },
    items: [
      ["Ember Drake", "A young drake that breathes sparks. Common but fiery.", 25, 10n],
      ["Frost Wyrm", "Ancient wyrm from the northern glaciers.", 10, 20n],
      ["Storm Kraken", "Summons lightning from the deep.", 5, 50n],
      ["Moss Sprite", "A forest helper. Every deck needs one.", 50, 2n],
      ["Sun Phoenix", "Reborn every dawn. Ultra rare.", 3, 100n],
      ["Shadow Lynx", "Strikes from the dark, never seen twice.", 15, 15n],
    ],
  },
  {
    account: ACCOUNTS.publisherB,
    store: { slug: "mythic-forge", name: "Mythic Forge", description: "Legendary gear forged for heroes of every realm." },
    items: [
      ["Runeblade of Dawn", "A sword etched with morning runes.", 20, 12n],
      ["Aegis of Tides", "A shield that turns waves into walls.", 8, 30n],
      ["Crown of Thorns", "Power at a price. Only two exist.", 2, 200n],
      ["Wanderer's Map", "Shows a new path every time it is opened.", 100, 1n],
      ["Void Lantern", "Lights the way through the void.", 12, 25n],
      ["Titan Gauntlet", "Grants the strength of a mountain.", 6, 40n],
    ],
  },
];

const { total } = await api(URLS.catalog, "/catalog/stores?limit=1");
if (total > 0 && !process.argv.includes("--force")) {
  console.log(`✔ Catalog already has ${total} store(s); skipping seed (use --force to add anyway)`);
  process.exit(0);
}

let hue = 12;
for (const { account, store, items } of STORES) {
  const token = await login(account);
  const created = await ensureStore(token, store);
  console.log(`✔ store ${created.slug} owned by ${account.address}`);
  for (const [name, description, supply, priceInMilli] of items) {
    const imageUrl = await uploadPng(token, renderCardPng({ hue: (hue += 47) % 360 }));
    const item = await api(URLS.catalog, "/catalog/items", {
      method: "POST",
      token,
      body: { name, description, imageUrl, supply, priceWei: (priceInMilli * MILLI).toString() },
    });
    await api(URLS.catalog, `/catalog/items/${item.id}/publish`, { method: "POST", token });
    console.log(`  • ${name} (${supply} copies @ ${Number(priceInMilli) / 1000} ETH)`);
  }
}
console.log(`\nStorefront: ${process.env.STOREFRONT_URL ?? "http://localhost:3100"}/s/pixel-legends`);
