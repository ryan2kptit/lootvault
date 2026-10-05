"use client";

import { formatDateTime } from "@lootvault/web-shared/format";
import { Badge, Button, buttonVariants, cn, EmptyState, ErrorState, LoadingState, NftCard, OrderStatusBadge, PriceTag } from "@lootvault/web-shared/ui";
import { errorMessage, RequireSignIn, useApi, useSession } from "@lootvault/web-shared/wallet";
import { useQuery } from "@tanstack/react-query";
import { Gem, Receipt } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function Collection({ address }: { address: string }) {
  const api = useApi();
  const holdings = useQuery({ queryKey: ["holdings", address], queryFn: () => api.catalog.holdings(address) });

  if (holdings.isPending) return <LoadingState label="Loading your collection…" />;
  if (holdings.isError) return <ErrorState message={errorMessage(holdings.error)} action={<Button variant="outline" onClick={() => holdings.refetch()}>Try again</Button>} />;
  if (holdings.data.length === 0) {
    return (
      <EmptyState
        icon={<Gem />}
        title="No NFTs yet"
        description="Items you buy show up here a few seconds after payment."
        action={<Link href="/" className={buttonVariants({ variant: "outline" })}>Browse stores</Link>}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {holdings.data.map(({ tokenId, balance, item }) => (
        <NftCard key={tokenId} href={`/items/${item.id}`} name={item.name} imageUrl={item.imageUrl} priceWei={item.priceWei} badge={<Badge tone="primary">× {balance}</Badge>} />
      ))}
    </div>
  );
}

function Orders({ address }: { address: string }) {
  const api = useApi();
  const orders = useQuery({ queryKey: ["my-orders", address], queryFn: () => api.orders.mine({ limit: 50 }) });

  if (orders.isPending) return <LoadingState label="Loading your orders…" />;
  if (orders.isError) return <ErrorState message={errorMessage(orders.error)} action={<Button variant="outline" onClick={() => orders.refetch()}>Try again</Button>} />;
  if (orders.data.items.length === 0) return <EmptyState icon={<Receipt />} title="No orders yet" description="Your checkouts and payments appear here." />;

  return (
    <ul className="flex flex-col gap-3">
      {orders.data.items.map((order) => (
        <li key={order.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
          <div className="flex -space-x-3">
            {order.lines.slice(0, 3).map((line) => (
              <img key={line.itemId} src={line.imageUrl} alt="" className="size-12 rounded-lg border-2 border-card object-cover" />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{order.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}</p>
            <p className="text-sm text-muted-foreground">
              <Link href={`/s/${order.storeSlug}`} className="hover:underline">
                {order.storeSlug}
              </Link>{" "}
              · {formatDateTime(order.paidAt ?? order.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={order.status} />
            <PriceTag wei={order.totalWei} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const TABS = [
  { id: "collection", label: "My collection" },
  { id: "orders", label: "My orders" },
] as const;

function Account() {
  const { session } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("collection");
  if (!session) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 border-b">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm", tab === id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "collection" ? <Collection address={session.address} /> : <Orders address={session.address} />}
    </div>
  );
}

export default function MePage() {
  return (
    <RequireSignIn title="Your collection" description="Connect your wallet and sign in to see the NFTs you own and your orders.">
      <Account />
    </RequireSignIn>
  );
}
