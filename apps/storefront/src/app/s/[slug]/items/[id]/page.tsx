import { PriceTag, Skeleton, StockBadge } from "@lootvault/web-shared/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ItemRecentSales } from "@/components/item-recent-sales";
import { PurchasePanel } from "@/components/purchase-panel";
import { getItem } from "@/lib/server-api";

/** The item, if it belongs to this store (a stale or hand-edited URL with another slug is a 404). */
async function itemOfStore(params: PageProps<"/s/[slug]/items/[id]">["params"]) {
  const { slug, id } = await params;
  const item = await getItem(id);
  if (item.store.slug !== slug) notFound();
  return item;
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]/items/[id]">): Promise<Metadata> {
  const item = await itemOfStore(params);
  const title = `${item.name} · ${item.store.name}`;
  const description = item.description || `${item.name}, a limited NFT edition from ${item.store.name}.`;
  return {
    title,
    description,
    alternates: { canonical: `/s/${item.store.slug}/items/${item.id}` },
    openGraph: { title, description, type: "website", url: `/s/${item.store.slug}/items/${item.id}`, images: [{ url: item.imageUrl, alt: item.name }] },
    twitter: { card: "summary_large_image", title, description, images: [item.imageUrl] },
  };
}

export default async function ItemPage({ params }: PageProps<"/s/[slug]/items/[id]">) {
  const item = await itemOfStore(params);

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-muted">
          <img src={item.imageUrl} alt={item.name} className="aspect-square w-full object-cover" />
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Link href={`/s/${item.store.slug}`} className="text-sm text-muted-foreground hover:underline">
              {item.store.name}
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">{item.name}</h1>
            <div className="flex items-center gap-3">
              <PriceTag wei={item.priceWei} className="text-2xl" />
              <StockBadge remaining={item.remaining} />
            </div>
            <p className="text-sm text-muted-foreground">
              {item.sold} of {item.supply} sold · edition of {item.supply}
            </p>
          </div>
          {item.description ? <p className="whitespace-pre-line leading-relaxed">{item.description}</p> : null}
          <PurchasePanel item={item} slug={item.store.slug} />
        </div>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent sales</h2>
        <Suspense fallback={<Skeleton className="h-24" />}>
          <ItemRecentSales itemId={item.id} />
        </Suspense>
      </section>
    </div>
  );
}
