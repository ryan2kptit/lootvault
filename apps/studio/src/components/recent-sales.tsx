"use client";

import { formatDateTime, shortAddress } from "@lootvault/web-shared/format";
import { EmptyState, ErrorState, PriceTag, Skeleton } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";

export function RecentSales({ storeId }: { storeId: string }) {
  const api = useApi();
  const sales = useQuery({ queryKey: ["recent-sales", storeId], queryFn: () => api.orders.recentSales({ storeId, limit: 8 }) });

  if (sales.isPending) return <Skeleton className="h-48" />;
  if (sales.isError) return <ErrorState message={errorMessage(sales.error)} />;
  if (sales.data.length === 0) return <EmptyState icon={<Receipt />} title="No sales yet" description="Paid orders show up here." />;

  return (
    <ul className="divide-y">
      {sales.data.map((sale) => (
        <li key={sale.orderId} className="flex items-center justify-between gap-3 py-3 text-sm">
          <div className="flex flex-col">
            <span className="font-mono text-xs">{shortAddress(sale.buyer)}</span>
            <span className="text-xs text-muted-foreground">
              {sale.quantity} {sale.quantity === 1 ? "copy" : "copies"} · {formatDateTime(sale.paidAt)}
            </span>
          </div>
          <PriceTag wei={sale.totalWei} />
        </li>
      ))}
    </ul>
  );
}
