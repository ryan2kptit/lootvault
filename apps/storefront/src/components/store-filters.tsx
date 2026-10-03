import { buttonVariants, Input, Select } from "@lootvault/web-shared/ui";
import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import type { StoreFilters as Filters } from "@/lib/store-filters";

const SORT_LABELS = { newest: "Newest", price_asc: "Price: low to high", price_desc: "Price: high to low" } as const;

/** A plain GET form: submitting navigates to /s/{slug}?q=…, so the server renders the results and the URL is shareable. */
export function StoreFilters({ slug, filters }: { slug: string; filters: Filters }) {
  return (
    <Form action={`/s/${slug}`} className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_1.3fr_auto]">
      <label className="relative sm:col-span-2 lg:col-span-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={filters.q} placeholder="Search items" className="pl-9" />
      </label>
      <Input name="minPrice" defaultValue={filters.minPrice} inputMode="decimal" placeholder="Min ETH" aria-label="Minimum price in ETH" />
      <Input name="maxPrice" defaultValue={filters.maxPrice} inputMode="decimal" placeholder="Max ETH" aria-label="Maximum price in ETH" />
      <label className="flex h-10 items-center gap-2 whitespace-nowrap text-sm">
        <input type="checkbox" name="inStock" value="true" defaultChecked={filters.inStock} className="size-4 accent-[var(--primary)]" />
        In stock
      </label>
      <Select name="sort" defaultValue={filters.sort} aria-label="Sort">
        {Object.entries(SORT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <button type="submit" className={buttonVariants({ className: "flex-1" })}>
          Apply
        </button>
        <Link href={`/s/${slug}`} className={buttonVariants({ variant: "ghost" })}>
          Reset
        </Link>
      </div>
    </Form>
  );
}
