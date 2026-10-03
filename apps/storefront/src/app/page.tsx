import { Skeleton } from "@lootvault/web-shared/ui";
import { Suspense } from "react";

import { StoreGrid } from "@/components/store-grid";

export default function StoresPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 py-10 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Collect cards from independent stores</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">Limited NFT editions, paid on-chain in one transaction. Every store sets its own prices and edition sizes.</p>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Stores</h2>
        <Suspense fallback={<Skeleton className="h-32" />}>
          <StoreGrid />
        </Suspense>
      </section>
    </div>
  );
}
