"use client";

import { formatEth } from "@lootvault/web-shared/format";
import { Button, buttonVariants, EmptyState, ErrorState, LoadingState, Table, Td, Th } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Package, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ItemStatusBadge } from "@/components/item-status-badge";
import { Pager } from "@/components/pager";
import { PublishButton } from "@/components/publish-button";
import { RequireStore } from "@/components/require-store";

const PAGE_SIZE = 20;

function ItemsTable({ storeId }: { storeId: string }) {
  const api = useApi();
  const [page, setPage] = useState(1);
  const items = useQuery({
    queryKey: ["my-items", storeId, page],
    queryFn: () => api.catalog.myItems({ page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  if (items.isPending) return <LoadingState label="Loading items…" />;
  if (items.isError) return <ErrorState message={errorMessage(items.error)} action={<Button variant="outline" onClick={() => items.refetch()}>Try again</Button>} />;
  if (items.data.total === 0) {
    return (
      <EmptyState
        icon={<Package />}
        title="No items yet"
        description="Create your first NFT edition. It stays a draft until you publish it."
        action={<Link href="/items/new" className={buttonVariants()}><Plus /> New item</Link>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <thead>
          <tr>
            <Th>Item</Th>
            <Th>Status</Th>
            <Th className="text-right">Price</Th>
            <Th className="text-right">Sold</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {items.data.items.map((item) => (
            <tr key={item.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <img src={item.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                  <span className="font-medium">{item.name}</span>
                </div>
              </Td>
              <Td>
                <ItemStatusBadge status={item.status} />
              </Td>
              <Td className="text-right tabular-nums">{formatEth(item.priceWei)}</Td>
              <Td className="text-right tabular-nums">
                {item.sold}/{item.supply}
              </Td>
              <Td>
                <div className="flex justify-end gap-2">
                  <PublishButton item={item} />
                  <Link href={`/items/${item.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    <Pencil /> Edit
                  </Link>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pager page={page} limit={PAGE_SIZE} total={items.data.total} onPage={setPage} />
    </div>
  );
}

export default function ItemsPage() {
  return (
    <RequireStore>
      {(store) => (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Items</h1>
              <p className="text-sm text-muted-foreground">Drafts, live and hidden editions of {store.name}.</p>
            </div>
            <Link href="/items/new" className={buttonVariants()}>
              <Plus /> New item
            </Link>
          </div>
          <ItemsTable storeId={store.id} />
        </div>
      )}
    </RequireStore>
  );
}
