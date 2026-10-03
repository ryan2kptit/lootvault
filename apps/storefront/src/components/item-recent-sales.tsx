import { formatDateTime, shortAddress } from "@lootvault/web-shared/format";
import { PriceTag } from "@lootvault/web-shared/ui";

import { serverApi } from "@/lib/server-api";

/** Last paid orders for one item. Streams in after the item; a failure only hides this section. */
export async function ItemRecentSales({ itemId }: { itemId: string }) {
  const sales = await serverApi.orders.recentSales({ itemId, limit: 5 }).catch(() => null);
  if (sales === null) return <p className="text-sm text-muted-foreground">Recent sales are unavailable right now.</p>;
  if (sales.length === 0) return <p className="text-sm text-muted-foreground">No sales yet. Be the first collector.</p>;

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {sales.map((sale) => (
        <li key={sale.orderId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span>
            <span className="font-mono text-xs">{shortAddress(sale.buyer)}</span> bought {sale.quantity}
          </span>
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="hidden sm:inline">{formatDateTime(sale.paidAt)}</span>
            <PriceTag wei={sale.totalWei} className="text-foreground" />
          </span>
        </li>
      ))}
    </ul>
  );
}
