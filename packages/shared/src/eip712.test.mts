import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashTypedData, zeroAddress } from "viem";

import { checkoutTypedData, checkoutTypes } from "./eip712.mjs";

describe("eip712", () => {
  const message = {
    orderId: `0x${"11".repeat(32)}` as const,
    buyer: zeroAddress,
    lines: [{ tokenId: 1n, creator: zeroAddress, quantity: 2n, unitPrice: 10n, maxSupply: 5n }],
    deadline: 1_700_000_000n,
  };

  it("builds the LootVault v1 domain", () => {
    const typed = checkoutTypedData(31337, zeroAddress, message);
    assert.deepEqual(typed.domain, { name: "LootVault", version: "1", chainId: 31337, verifyingContract: zeroAddress });
    assert.equal(typed.primaryType, "Checkout");
  });

  it("keeps field order identical to the Solidity typehash", () => {
    assert.deepEqual(
      checkoutTypes.Line.map((f) => `${f.type} ${f.name}`).join(","),
      "uint256 tokenId,address creator,uint256 quantity,uint256 unitPrice,uint256 maxSupply",
    );
    assert.deepEqual(
      checkoutTypes.Checkout.map((f) => `${f.type} ${f.name}`).join(","),
      "bytes32 orderId,address buyer,Line[] lines,uint256 deadline",
    );
  });

  it("produces a stable digest viem can hash", () => {
    const digest = hashTypedData(checkoutTypedData(31337, zeroAddress, message));
    assert.match(digest, /^0x[0-9a-f]{64}$/);
  });
});
