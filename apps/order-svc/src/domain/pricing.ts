import type { CartLineInput } from "./cart-rules";
import type { CatalogItem } from "./catalog-item";

export interface PricedLine {
  itemId: string;
  tokenId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  /** The price the platform signs; the contract charges exactly this. */
  unitPriceWei: bigint;
  creator: `0x${string}`;
  maxSupply: number;
}

/**
 * Turns validated cart lines into signed-checkout lines. Today the unit price is the listed
 * price; this is the single place to apply discounts, promotions or per-buyer pricing.
 */
export function priceLines(lines: CartLineInput[], items: Map<string, CatalogItem>): PricedLine[] {
  return lines.map((line) => {
    const item = items.get(line.itemId)!;
    return {
      itemId: item.id,
      tokenId: item.tokenId,
      name: item.name,
      imageUrl: item.imageUrl,
      quantity: line.quantity,
      unitPriceWei: BigInt(item.priceWei),
      creator: item.ownerAddress,
      maxSupply: item.supply,
    };
  });
}

export function orderTotal(lines: PricedLine[]): bigint {
  return lines.reduce((sum, line) => sum + line.unitPriceWei * BigInt(line.quantity), 0n);
}
