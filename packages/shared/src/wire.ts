import type { Address, Hex } from "viem";

import type { CheckoutMessage } from "./eip712";

/** JSON-safe form of a CheckoutLine: every uint256 is a decimal string. */
export interface CheckoutLineWire {
  tokenId: string;
  creator: Address;
  quantity: string;
  unitPrice: string;
  maxSupply: string;
}

/** JSON-safe form of a CheckoutMessage, as returned by `POST /orders/checkout`. */
export interface CheckoutWire {
  orderId: Hex;
  buyer: Address;
  lines: CheckoutLineWire[];
  deadline: string;
}

export function checkoutToWire(checkout: CheckoutMessage): CheckoutWire {
  return {
    orderId: checkout.orderId,
    buyer: checkout.buyer,
    deadline: checkout.deadline.toString(),
    lines: checkout.lines.map((line) => ({
      tokenId: line.tokenId.toString(),
      creator: line.creator,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      maxSupply: line.maxSupply.toString(),
    })),
  };
}

export function checkoutFromWire(wire: CheckoutWire): CheckoutMessage {
  return {
    orderId: wire.orderId,
    buyer: wire.buyer,
    deadline: BigInt(wire.deadline),
    lines: wire.lines.map((line) => ({
      tokenId: BigInt(line.tokenId),
      creator: line.creator,
      quantity: BigInt(line.quantity),
      unitPrice: BigInt(line.unitPrice),
      maxSupply: BigInt(line.maxSupply),
    })),
  };
}
