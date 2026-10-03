import type { Store } from "@lootvault/web-shared/api";
import { cn } from "@lootvault/web-shared/ui";

/** The store's logo, or its initial on an accent tile. */
export function StoreLogo({ store, className }: { store: Pick<Store, "name" | "logoUrl">; className?: string }) {
  if (store.logoUrl) return <img src={store.logoUrl} alt="" className={cn("shrink-0 rounded-xl object-cover", className)} />;
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl font-semibold text-primary", className)}>
      {store.name.charAt(0).toUpperCase()}
    </div>
  );
}
