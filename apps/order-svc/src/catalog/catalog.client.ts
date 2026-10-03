import { AppError } from "@lootvault/nest-common";

import type { CatalogItem } from "../domain/catalog-item";

export const CATALOG_CLIENT = Symbol("CATALOG_CLIENT");

export interface CatalogClient {
  getItems(ids: string[], requestId?: string): Promise<CatalogItem[]>;
}

const unavailable = () => new AppError("CATALOG_UNAVAILABLE", 503, "Catalog is unavailable, please retry");

/** Synchronous call for checkout: price, status and stock must be fresh. Fails closed. */
export class HttpCatalogClient implements CatalogClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalKey: string,
    private readonly timeoutMs = 3000,
  ) {}

  async getItems(ids: string[], requestId?: string): Promise<CatalogItem[]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/catalog/internal/items/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-key": this.internalKey,
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
        body: JSON.stringify({ ids }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw unavailable();
    }
    if (!response.ok) throw unavailable();
    return (await response.json()) as CatalogItem[];
  }
}
