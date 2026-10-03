import type { Hex } from "viem";

import type { HttpClient } from "./http";
import type { CartLineInput, CheckoutResult, ConfirmResult, Order, OrdersQuery, Page, RecentSale, RecentSalesQuery, SalesStats } from "./types";

/** order-svc (`/orders`): checkout, payment confirmation, order history and sales stats. */
export function ordersApi(http: HttpClient) {
  return {
    checkout: (lines: CartLineInput[]) => http<CheckoutResult>("orders", "/checkout", { method: "POST", body: { lines } }),
    confirm: (id: string, txHash: Hex) => http<ConfirmResult>("orders", `/${id}/confirm`, { method: "POST", body: { txHash } }),
    get: (id: string) => http<Order>("orders", `/${id}`),
    mine: (query: OrdersQuery = {}) => http<Page<Order>>("orders", "/me", { query }),
    recentSales: (query: RecentSalesQuery) => http<RecentSale[]>("orders", "/recent-sales", { query }),

    // Seller (Studio)
    storeSales: (query: OrdersQuery = {}) => http<Page<Order>>("orders", "/store/me", { query }),
    storeStats: () => http<SalesStats>("orders", "/store/me/stats"),
  };
}
