import type { Store } from "@lootvault/web-shared/api";
import Link from "next/link";

import { StoreLogo } from "./store-logo";

export function StoreCard({ store }: { store: Store }) {
  return (
    <Link href={`/s/${store.slug}`} className="flex gap-4 rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <StoreLogo store={store} className="size-14" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{store.name}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{store.description || "No description yet."}</p>
      </div>
    </Link>
  );
}
