#!/usr/bin/env node
// Seeds two stores with six published NFTs each, through the public APIs (services must be running).
// Artwork is CC0 and committed under scripts/assets/seed (see CREDITS.md there), so seeding needs no network.
// Skips when stores already exist unless --force.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ACCOUNTS } from "./lib/accounts.mjs";
import { api, ensureStore, env, login, uploadPng, URLS } from "./lib/api.mjs";
import { assertLocalRpc } from "./lib/local-guard.mjs";

await assertLocalRpc(env.RPC_URL); // public anvil keys: local chain only

const MILLI = 10n ** 15n; // 0.001 ETH in wei

const ART = path.join(import.meta.dirname, "assets", "seed");
const TOADZ = "Art: CrypToadz #%d by Gremplin (CC0).";
const NOUNS = "Art: Noun #%d from Nouns DAO (CC0).";
const credit = (template, id) => template.replace("%d", String(id));

const STORES = [
  {
    account: ACCOUNTS.publisherA,
    store: { slug: "swamp-critters", name: "Swamp Critters", description: "Warty heroes and villains from the pixel swamp." },
    items: [
      ["toad-2.png", "Glow Lasagna", `Glows blue after a big lasagna dinner. ${credit(TOADZ, 2)}`, 25, 10n],
      ["toad-3.png", "Gargoyle Explorer", `Maps every bog, never smiles. ${credit(TOADZ, 3)}`, 10, 20n],
      ["toad-4.png", "Vampire Wizard", `Casts spells only after midnight. ${credit(TOADZ, 4)}`, 5, 50n],
      ["toad-5.png", "Floppy-Hat Judge", `Settles every swamp dispute. ${credit(TOADZ, 5)}`, 50, 2n],
      ["toad-6.png", "Pigtail Creep", `Ultra rare. Nobody knows where it came from. ${credit(TOADZ, 6)}`, 3, 100n],
      ["toad-7.png", "One-Fly Bandit", `Steals exactly one fly a day. ${credit(TOADZ, 7)}`, 15, 15n],
    ],
  },
  {
    account: ACCOUNTS.publisherB,
    store: { slug: "pixel-folk", name: "Pixel Folk", description: "Square-headed townsfolk, each with their own odd charm." },
    items: [
      ["noun-1.png", "Foxfire Captain", `Leads the night watch with a lantern hat. ${credit(NOUNS, 1)}`, 20, 12n],
      ["noun-3.png", "Shadow Hound", `Never takes off the shades. ${credit(NOUNS, 3)}`, 8, 30n],
      ["noun-7.png", "Frame Watcher", `Sees the whole town from inside a picture frame. ${credit(NOUNS, 7)}`, 2, 200n],
      ["noun-12.png", "Ember Spirit", `Warm company on cold nights. ${credit(NOUNS, 12)}`, 100, 1n],
      ["noun-21.png", "Disco Oracle", `Reflects every possible future. ${credit(NOUNS, 21)}`, 12, 25n],
      ["noun-40.png", "Ghost Grid", `Only half here, always on time. ${credit(NOUNS, 40)}`, 6, 40n],
    ],
  },
];

const { total } = await api(URLS.catalog, "/catalog/stores?limit=1");
if (total > 0 && !process.argv.includes("--force")) {
  console.log(`✔ Catalog already has ${total} store(s); skipping seed (use --force to add anyway)`);
  process.exit(0);
}

for (const { account, store, items } of STORES) {
  const token = await login(account);
  const created = await ensureStore(token, store);
  console.log(`✔ store ${created.slug} owned by ${account.address}`);
  for (const [file, name, description, supply, priceInMilli] of items) {
    const imageUrl = await uploadPng(token, await readFile(path.join(ART, file)));
    const item = await api(URLS.catalog, "/catalog/items", {
      method: "POST",
      token,
      body: { name, description, imageUrl, supply, priceWei: (priceInMilli * MILLI).toString() },
    });
    await api(URLS.catalog, `/catalog/items/${item.id}/publish`, { method: "POST", token });
    console.log(`  • ${name} (${supply} copies @ ${Number(priceInMilli) / 1000} ETH)`);
  }
}
console.log(`\nStorefront: ${process.env.STOREFRONT_URL ?? "http://localhost:3100"}/s/swamp-critters`);
