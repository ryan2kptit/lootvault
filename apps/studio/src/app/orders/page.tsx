"use client";

import type { OrderStatus } from "@lootvault/web-shared/api";
import { formatDateTime, shortAddress } from "@lootvault/web-shared/format";
import { Button, cn, EmptyState, ErrorState, LoadingState, OrderStatusBadge, PriceTag, Table, Td, Th } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { useState } from "react";

import { Pager } from "@/components/pager";
import { RequireStore } from "@/components/require-store";

const PAGE_SIZE = 20;
const FILTERS: { label: string; status?: OrderStatus }[] = [
  { label: "All" },
  { label: "Paid", status: "PAID" },
  { label: "Pending", status: "PENDING" },
  { label: "Expired", status: "EXPIRED" },
];

function SalesTable({ storeId }: { storeId: string }) {
  const api = useApi();
  const [status, setStatus] = useState<OrderStatus>();
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ["store-sales", storeId, status, page],
    queryFn: () => api.orders.storeSales({ status, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1">
        {FILTERS.map((filter) => (
          <Button
            key={filter.label}
            size="sm"
            variant="ghost"
            className={cn(filter.status === status && "bg-muted font-semibold")}
            onClick={() => {
              setStatus(filter.status);
              setPage(1);
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      {orders.isPending ? (
        <LoadingState label="Loading orders…" />
      ) : orders.isError ? (
        <ErrorState message={errorMessage(orders.error)} action={<Button variant="outline" onClick={() => orders.refetch()}>Try again</Button>} />
      ) : orders.data.total === 0 ? (
        <EmptyState icon={<Receipt />} title="No orders" description="Orders appear here as soon as a buyer checks out." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Buyer</Th>
                <Th>Items</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {orders.data.items.map((order) => (
                <tr key={order.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(order.paidAt ?? order.createdAt)}</Td>
                  <Td className="font-mono text-xs">{shortAddress(order.buyer)}</Td>
                  <Td>
                    {order.lines.map((line) => (
                      <div key={line.itemId}>
                        {line.quantity} × {line.name}
                      </div>
                    ))}
                  </Td>
                  <Td>
                    <OrderStatusBadge status={order.status} />
                  </Td>
                  <Td className="text-right">
                    <PriceTag wei={order.totalWei} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pager page={page} limit={PAGE_SIZE} total={orders.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequireStore>
      {(store) => (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Orders</h1>
            <p className="text-sm text-muted-foreground">Every checkout for {store.name}, newest first.</p>
          </div>
          <SalesTable storeId={store.id} />
        </div>
      )}
    </RequireStore>
  );
}
