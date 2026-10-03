import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lootVault1155Abi } from "./index";

describe("lootVault1155Abi", () => {
  const names = lootVault1155Abi.map((entry) => ("name" in entry ? `${entry.type}:${entry.name}` : entry.type));

  it("exposes purchase/hashCheckout and the events the indexer decodes", () => {
    for (const expected of ["function:purchase", "function:hashCheckout", "event:Purchased", "event:TransferSingle"]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
  });

  it("exposes the custom errors the frontend maps to messages", () => {
    for (const expected of ["error:SoldOut", "error:Expired", "error:WrongBuyer", "error:OrderUsed", "error:InvalidSignature"]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
  });
});
