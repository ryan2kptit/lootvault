#!/usr/bin/env node
// One-off: downloads the CC0 artwork that `npm run seed` uses into scripts/assets/seed/ (committed).
// The seed itself never touches the network, so a dead gateway can't break a demo.
// Sources: CrypToadz by Gremplin (CC0; images on Arweave) and Nouns (CC0; on-chain SVG, PNG render via noun.pics).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "assets", "seed");
const TOADZ_METADATA = "https://arweave.net/OVAmf1xgB6atP0uZg1U0fMd0Lw6DlsVqdvab-WTXZ1Q";
const NOUNS_PNG = "https://noun.pics";
// Keep the demo family-friendly: skip toadz whose traits involve smoking, drugs, alcohol or weapons.
const UNSUITABLE = /cig|smok|joint|blunt|pipe|vape|beer|bong|weed|420|drunk|knife|gun|blood|skull/i;
const PER_STORE = 6;

async function get(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response;
}

async function fetchToadz() {
  const picked = [];
  for (let id = 1; picked.length < PER_STORE; id++) {
    const meta = await (await get(`${TOADZ_METADATA}/${id}`)).json();
    const traits = meta.attributes.filter((a) => !/^#|Background/.test(a.trait_type));
    if (traits.some((a) => UNSUITABLE.test(String(a.value)))) continue;
    await writeFile(path.join(OUT, `toad-${id}.png`), Buffer.from(await (await get(meta.image)).arrayBuffer()));
    picked.push({ file: `toad-${id}.png`, source: `CrypToadz #${id}`, traits: traits.map((a) => String(a.value)) });
    console.log(`✔ CrypToadz #${id}: ${traits.map((a) => a.value).join(", ")}`);
  }
  return picked;
}

async function fetchNouns() {
  const ids = [1, 3, 7, 12, 21, 40];
  const picked = [];
  for (const id of ids) {
    await writeFile(path.join(OUT, `noun-${id}.png`), Buffer.from(await (await get(`${NOUNS_PNG}/${id}.png`)).arrayBuffer()));
    picked.push({ file: `noun-${id}.png`, source: `Noun #${id}` });
    console.log(`✔ Noun #${id}`);
  }
  return picked;
}

await mkdir(OUT, { recursive: true });
const sources = { toadz: await fetchToadz(), nouns: await fetchNouns() };
await writeFile(path.join(OUT, "sources.json"), `${JSON.stringify(sources, null, 2)}\n`);
console.log(`\nWrote ${sources.toadz.length + sources.nouns.length} images and sources.json to ${path.relative(process.cwd(), OUT)}`);
