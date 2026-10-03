import type { Address, Hex } from "viem";

export const EIP712_NAME = "LootVault";
export const EIP712_VERSION = "1";

/**
 * EIP-712 types for LootVault1155.purchase().
 * MUST mirror LINE_TYPEHASH / CHECKOUT_TYPEHASH in LootVault1155.sol field-for-field;
 * the contract test `hashCheckout matches the off-chain EIP-712 digest` enforces it.
 */
export const checkoutTypes = {
  Checkout: [
    { name: "orderId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "lines", type: "Line[]" },
    { name: "deadline", type: "uint256" },
  ],
  Line: [
    { name: "tokenId", type: "uint256" },
    { name: "creator", type: "address" },
    { name: "quantity", type: "uint256" },
    { name: "unitPrice", type: "uint256" },
    { name: "maxSupply", type: "uint256" },
  ],
} as const;

export interface CheckoutLine {
  tokenId: bigint;
  creator: Address;
  quantity: bigint;
  unitPrice: bigint;
  maxSupply: bigint;
}

export interface CheckoutMessage {
  orderId: Hex;
  buyer: Address;
  lines: CheckoutLine[];
  deadline: bigint;
}

export function lootVaultDomain(chainId: number, verifyingContract: Address) {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract } as const;
}

export function checkoutTypedData(chainId: number, verifyingContract: Address, message: CheckoutMessage) {
  return {
    domain: lootVaultDomain(chainId, verifyingContract),
    types: checkoutTypes,
    primaryType: "Checkout" as const,
    message,
  };
}
