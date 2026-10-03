import type { HttpClient } from "./http";
import type {
  CreateStoreInput,
  Holding,
  ImageType,
  Item,
  ItemInput,
  Page,
  PageQuery,
  PresignedUpload,
  PublicItem,
  Store,
  StoreItemsQuery,
} from "./types";

/** catalog-svc (`/catalog`): stores, items, uploads and holdings. */
export function catalogApi(http: HttpClient) {
  return {
    // Storefront (public)
    listStores: (query: PageQuery = {}) => http<Page<Store>>("catalog", "/stores", { query }),
    getStore: (slug: string) => http<Store>("catalog", `/stores/${encodeURIComponent(slug)}`),
    listStoreItems: (slug: string, query: StoreItemsQuery = {}) =>
      http<Page<Item>>("catalog", `/stores/${encodeURIComponent(slug)}/items`, { query }),
    /** LIVE items for everyone; drafts and hidden items for their owner only. */
    getItem: (id: string) => http<PublicItem>("catalog", `/items/${encodeURIComponent(id)}`),
    holdings: (address: string) => http<Holding[]>("catalog", `/holdings/${address}`),

    // Studio (signed in, acts on the caller's own store)
    myStore: () => http<Store>("catalog", "/stores/me"),
    createStore: (input: CreateStoreInput) => http<Store>("catalog", "/stores", { method: "POST", body: input }),
    myItems: (query: PageQuery = {}) => http<Page<Item>>("catalog", "/me/items", { query }),
    createItem: (input: ItemInput) => http<Item>("catalog", "/items", { method: "POST", body: input }),
    updateItem: (id: string, input: Partial<ItemInput>) => http<Item>("catalog", `/items/${id}`, { method: "PATCH", body: input }),
    publishItem: (id: string) => http<Item>("catalog", `/items/${id}/publish`, { method: "POST" }),
    unpublishItem: (id: string) => http<Item>("catalog", `/items/${id}/unpublish`, { method: "POST" }),
    presignUpload: (contentType: ImageType) =>
      http<PresignedUpload>("catalog", "/uploads/presign", { method: "POST", body: { contentType } }),
  };
}
