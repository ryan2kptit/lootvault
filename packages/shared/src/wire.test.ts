import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zeroAddress } from "viem";

import type { CheckoutMessage } from "./eip712";
import { checkoutFromWire, checkoutToWire } from "./wire";

describe("checkout wire format", () => {
  const checkout: CheckoutMessage = {
    orderId: `0x${"ab".repeat(32)}`,
    buyer: zeroAddress,
    deadline: 1_700_000_300n,
    lines: [{ tokenId: (1n << 95n) + 7n, creator: zeroAddress, quantity: 2n, unitPrice: 10n ** 18n, maxSupply: 5n }],
  };

  it("serialises every uint256 as a decimal string so JSON.stringify works", () => {
    assert.throws(() => JSON.stringify(checkout), /BigInt/);
    const wire = checkoutToWire(checkout);
    assert.equal(wire.lines[0].tokenId, ((1n << 95n) + 7n).toString());
    assert.equal(wire.lines[0].unitPrice, "1000000000000000000");
    assert.equal(wire.deadline, "1700000300");
    assert.doesNotThrow(() => JSON.stringify(wire));
  });

  it("round-trips losslessly through JSON", () => {
    const back = checkoutFromWire(JSON.parse(JSON.stringify(checkoutToWire(checkout))));
    assert.deepEqual(back, checkout);
  });
});
