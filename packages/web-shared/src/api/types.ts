// JSON shapes of the backend routes. Money is always a decimal string of wei; dates are ISO strings.
import type { CheckoutWire } from "@lootvault/shared";
import type { Address, Hex } from "viem";

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

export interface Session {
  accessToken: string;
  address: string;
  expiresAt: string;
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  ownerAddress: string;
  createdAt: string;
}

export interface CreateStoreInput {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
}

export type ItemStatus = "DRAFT" | "LIVE" | "HIDDEN";

export interface Item {
  id: string;
  storeId: string;
  ownerAddress: string;
  tokenId: string;
  name: string;
  description: string;
  imageUrl: string;
  supply: number;
  sold: number;
  remaining: number;
  priceWei: string;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

/** `GET /catalog/items/:id` adds the item's store. */
export interface PublicItem extends Item {
  store: { id: string; slug: string; name: string };
}

export interface ItemInput {
  name: string;
  description?: string;
  imageUrl: string;
  supply: number;
  priceWei: string;
}

export const STOREFRONT_SORTS = ["newest", "price_asc", "price_desc"] as const;
export type StorefrontSort = (typeof STOREFRONT_SORTS)[number];

export interface StoreItemsQuery extends PageQuery {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  sort?: StorefrontSort;
}

export interface Holding {
  tokenId: string;
  balance: number;
  item: Item;
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  key: string;
  publicUrl: string;
}

export type OrderStatus = "PENDING" | "PAID" | "EXPIRED";

export interface OrderLine {
  itemId: string;
  tokenId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceWei: string;
}

export interface Order {
  id: string;
  orderId: Hex;
  buyer: string;
  storeId: string;
  storeSlug: string;
  sellerAddress: string;
  lines: OrderLine[];
  totalWei: string;
  feeWei: string | null;
  status: OrderStatus;
  deadline: string;
  txHash: Hex | null;
  paidAt: string | null;
  createdAt: string;
}

export interface OrdersQuery extends PageQuery {
  status?: OrderStatus;
}

export interface CartLineInput {
  itemId: string;
  quantity: number;
}

export interface CheckoutResult {
  order: Order;
  /** Everything the wallet needs for `LootVault1155.purchase(checkout, signature)` with `value`. */
  purchase: { chainId: number; contract: Address; checkout: CheckoutWire; signature: Hex; value: string };
}

/** `POST /orders/:id/confirm`: 200 PAID, or 202 PENDING_TX while the receipt is not available yet. */
export type ConfirmResult = { status: "PAID"; order: Order } | { status: "PENDING_TX" };

export interface SalesStats {
  grossWei: string;
  feeWei: string;
  netWei: string;
  ordersPaid: number;
  itemsSold: number;
  last7Days: { date: string; grossWei: string; orders: number }[];
}

export interface RecentSale {
  orderId: Hex;
  buyer: string;
  paidAt: string;
  txHash: Hex;
  totalWei: string;
  quantity: number;
}

export type RecentSalesQuery = ({ storeId: string } | { itemId: string }) & { limit?: number };
