# Seed artwork credits

`npm run seed` uploads these images. All of them are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). LootVault is not affiliated with either project. The item names and descriptions in `scripts/seed.mjs` are made up for the demo; each description names its source token.

| Files | Source | Creator | Where the original lives |
|---|---|---|---|
| `toad-2.png` … `toad-7.png` | CrypToadz #2–#7 | Gremplin | Arweave (`tokenURI` of `0x1CB1A5e65610AEFF2551A50f76a87a7d3fB649C6`) |
| `noun-1.png`, `noun-3.png`, `noun-7.png`, `noun-12.png`, `noun-21.png`, `noun-40.png` | Nouns #1, #3, #7, #12, #21, #40 | Nouns DAO | On-chain SVG (`0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03`); PNG renders from noun.pics |

`sources.json` records each file's token and traits.

## How the set was chosen

- Only collections whose art is still CC0 today. Moonbirds was CC0 from 2022, but its licence was changed after the 2024 Yuga Labs acquisition, so it is left out.
- Toadz with smoking, drug, alcohol or weapon traits are skipped (CrypToadz #1 has a cigarette), so the demo stays neutral.

`node scripts/fetch-seed-art.mjs` downloads the images again. It is only needed to change the set, and it needs network access. Public IPFS gateways such as ipfs.io and dweb.link no longer serve content directly, which is why the images are committed instead of fetched during seeding.
