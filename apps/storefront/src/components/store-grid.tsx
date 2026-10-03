import { EmptyState } from "@lootvault/web-shared/ui";
import { Store as StoreIcon } from "lucide-react";

import { serverApi } from "@/lib/server-api";

import { StoreCard } from "./store-card";

export async function StoreGrid() {
  const stores = await serverApi.catalog.listStores({ limit: 50 });
  if (stores.items.length === 0) {
    return <EmptyState icon={<StoreIcon />} title="No stores yet" description="Publishers open stores in LootVault Studio." />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stores.items.map((store) => (
        <StoreCard key={store.id} store={store} />
      ))}
    </div>
  );
}
