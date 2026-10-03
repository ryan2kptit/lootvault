"use client";

import type { Store } from "@lootvault/web-shared/api";
import { formatEth } from "@lootvault/web-shared/format";
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorState, Skeleton } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useQuery } from "@tanstack/react-query";
import { Coins, Layers, ShoppingBag, Wallet } from "lucide-react";

import { RecentSales } from "@/components/recent-sales";
import { RequireStore } from "@/components/require-store";
import { SalesChart } from "@/components/sales-chart";
import { StatCard } from "@/components/stat-card";

function Dashboard({ store }: { store: Store }) {
  const api = useApi();
  const stats = useQuery({ queryKey: ["store-stats", store.id], queryFn: () => api.orders.storeStats() });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{store.name}</h1>
        <p className="text-sm text-muted-foreground">Sales overview</p>
      </div>

      {stats.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : stats.isError ? (
        <ErrorState message={errorMessage(stats.error)} action={<Button variant="outline" onClick={() => stats.refetch()}>Try again</Button>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Gross revenue" value={formatEth(stats.data.grossWei)} icon={<Coins />} />
            <StatCard label="Net revenue" value={formatEth(stats.data.netWei)} hint={`after ${formatEth(stats.data.feeWei)} platform fees`} icon={<Wallet />} />
            <StatCard label="Paid orders" value={stats.data.ordersPaid} icon={<ShoppingBag />} />
            <StatCard label="Copies sold" value={stats.data.itemsSold} icon={<Layers />} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Last 7 days</CardTitle>
              </CardHeader>
              <CardContent>
                <SalesChart days={stats.data.last7Days} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recent sales</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <RecentSales storeId={store.id} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return <RequireStore>{(store) => <Dashboard store={store} />}</RequireStore>;
}
