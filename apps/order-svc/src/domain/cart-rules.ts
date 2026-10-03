import { AppError } from "@lootvault/nest-common";

import type { CatalogItem } from "./catalog-item";

export interface CartLineInput {
  itemId: string;
  quantity: number;
}

export const MAX_CART_LINES = 10;
export const MAX_LINE_QUANTITY = 10;

const invalid = (message: string) => new AppError("CART_INVALID", 400, message);

/** Shape rules that need no data: 1-10 distinct items, 1-10 copies each. */
export function validateCart(lines: CartLineInput[]): void {
  if (lines.length === 0) throw invalid("Cart is empty");
  if (lines.length > MAX_CART_LINES) throw invalid(`At most ${MAX_CART_LINES} different items per order`);
  const seen = new Set<string>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
      throw invalid(`Quantity must be 1-${MAX_LINE_QUANTITY}`);
    }
    if (seen.has(line.itemId)) throw invalid("Each item may appear only once");
    seen.add(line.itemId);
  }
}

/**
 * Rules that need fresh catalog data. `pending` = copies held by unexpired PENDING orders.
 * This "soft" stock check is best-effort (concurrent checkouts can both pass it);
 * the contract's supply cap is the hard guarantee.
 */
export function assertCheckoutable(lines: CartLineInput[], items: Map<string, CatalogItem>, pending: Map<string, number>): void {
  for (const line of lines) {
    const item = items.get(line.itemId);
    if (!item || item.status !== "LIVE") {
      throw new AppError("ITEM_UNAVAILABLE", 409, "An item in the cart is not for sale", { itemId: line.itemId });
    }
  }
  const storeIds = new Set(lines.map((line) => items.get(line.itemId)!.storeId));
  if (storeIds.size > 1) throw new AppError("MIXED_STORES", 400, "A cart can only contain items from one store");

  for (const line of lines) {
    const item = items.get(line.itemId)!;
    const available = item.supply - item.sold - (pending.get(line.itemId) ?? 0);
    if (line.quantity > available) {
      throw new AppError("INSUFFICIENT_STOCK", 409, `Only ${Math.max(available, 0)} left of "${item.name}"`, {
        itemId: line.itemId,
        available: Math.max(available, 0),
      });
    }
  }
}
