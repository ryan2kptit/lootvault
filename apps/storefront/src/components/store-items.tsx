import { EmptyState, NftCard, Skeleton, StockBadge } from "@lootvault/web-shared/ui";
import { SearchX } from "lucide-react";

import { orNotFound, serverApi } from "@/lib/server-api";
import { PAGE_SIZE, type StoreFilters, storeHref, toItemsQuery } from "@/lib/store-filters";

import { Pagination } from "./pagination";

/** The filtered, paginated grid of a store's live items. */
export async function StoreItems({ slug, filters }: { slug: string; filters: StoreFilters }) {
  const items = await orNotFound(serverApi.catalog.listStoreItems(slug, toItemsQuery(filters)));

  if (items.items.length === 0) {
    return <EmptyState icon={<SearchX />} title="No items match" description="Try another search or clear the filters." />;
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {items.total} {items.total === 1 ? "item" : "items"}
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.items.map((item) => (
          <NftCard
            key={item.id}
            href={`/s/${slug}/items/${item.id}`}
            name={item.name}
            imageUrl={item.imageUrl}
            priceWei={item.priceWei}
            badge={<StockBadge remaining={item.remaining} />}
          />
        ))}
      </div>
      <Pagination page={filters.page} pages={Math.ceil(items.total / PAGE_SIZE)} href={(page) => storeHref(slug, filters, { page })} />
    </div>
  );
}

export function StoreItemsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4]" />
      ))}
    </div>
  );
}
