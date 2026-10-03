// anvil's default accounts (PUBLIC test keys, local chain only). Addresses are derived, never hard-coded.
import { privateKeyToAccount } from "viem/accounts";

const KEYS = {
  publisherA: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // #3
  publisherB: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // #4
  buyer1: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // #5
  buyer2: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e", // #6
  smokePublisher: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", // #7
  smokeBuyer: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", // #8
  racePublisher: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6", // #9
};

export const ACCOUNTS = Object.fromEntries(Object.entries(KEYS).map(([role, key]) => [role, privateKeyToAccount(key)]));
