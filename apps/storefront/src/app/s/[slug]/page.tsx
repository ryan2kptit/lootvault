import type { Metadata } from "next";
import { Suspense } from "react";

import { StoreFilters } from "@/components/store-filters";
import { StoreItems, StoreItemsSkeleton } from "@/components/store-items";
import { getStore } from "@/lib/server-api";
import { parseStoreFilters, storeHref } from "@/lib/store-filters";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const store = await getStore((await params).slug);
  return { title: store.name, description: store.description || `NFT editions from ${store.name} on LootVault.` };
}

export default async function StorePage({ params, searchParams }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const filters = parseStoreFilters(await searchParams);

  return (
    <div className="flex flex-col gap-6">
      <StoreFilters slug={slug} filters={filters} />
      {/* Keyed by the URL so every new search shows the skeleton while the server renders the results. */}
      <Suspense key={storeHref(slug, filters)} fallback={<StoreItemsSkeleton />}>
        <StoreItems slug={slug} filters={filters} />
      </Suspense>
    </div>
  );
}
