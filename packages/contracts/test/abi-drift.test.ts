import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { lootVault1155Abi } from "@lootvault/shared";

describe("ABI drift guard", () => {
  it("@lootvault/shared exports the ABI of the compiled LootVault1155", () => {
    const artifactUrl = new URL("../artifacts/contracts/LootVault1155.sol/LootVault1155.json", import.meta.url);
    const artifact = JSON.parse(readFileSync(artifactUrl, "utf8"));
    assert.deepStrictEqual(artifact.abi, lootVault1155Abi, "ABI drift: run `npm run build -w @lootvault/contracts`");
  });
});
