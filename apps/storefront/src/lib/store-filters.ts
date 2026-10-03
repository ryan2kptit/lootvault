import { STOREFRONT_SORTS, type StoreItemsQuery, type StorefrontSort } from "@lootvault/web-shared/api";
import { ethToWei } from "@lootvault/web-shared/format";

export const PAGE_SIZE = 12;

/** The store page's search, filters, sort and page, exactly as they appear in the URL (prices in ETH). */
export interface StoreFilters {
  q: string;
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  sort: StorefrontSort;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const isSort = (value: string): value is StorefrontSort => STOREFRONT_SORTS.some((sort) => sort === value);

export function parseStoreFilters(params: SearchParams): StoreFilters {
  const sort = first(params.sort);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q),
    minPrice: first(params.minPrice),
    maxPrice: first(params.maxPrice),
    inStock: first(params.inStock) === "true",
    sort: isSort(sort) ? sort : "newest",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Filters -> catalog query (prices converted to wei; an invalid price is ignored). */
export function toItemsQuery(filters: StoreFilters): StoreItemsQuery {
  return {
    q: filters.q || undefined,
    minPrice: ethToWei(filters.minPrice) ?? undefined,
    maxPrice: ethToWei(filters.maxPrice) ?? undefined,
    inStock: filters.inStock || undefined,
    sort: filters.sort,
    page: filters.page,
    limit: PAGE_SIZE,
  };
}

/** URL of the store page with the same filters and some changed, e.g. another page. Defaults are left out. */
export function storeHref(slug: string, filters: StoreFilters, change: Partial<StoreFilters> = {}): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.minPrice) params.set("minPrice", next.minPrice);
  if (next.maxPrice) params.set("maxPrice", next.maxPrice);
  if (next.inStock) params.set("inStock", "true");
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return `/s/${slug}${query ? `?${query}` : ""}`;
}
