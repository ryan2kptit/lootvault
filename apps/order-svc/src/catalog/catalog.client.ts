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
    let body: unknown;
    try {
      const response = await fetch(`${this.baseUrl}/catalog/internal/items/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-key": this.internalKey,
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
        body: JSON.stringify({ ids }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
      if (!response.ok) throw unavailable();
      body = await response.json();
    } catch {
      // Network error, timeout, redirect, non-2xx or unparsable body: fail closed.
      throw unavailable();
    }
    if (!Array.isArray(body)) throw unavailable();
    return body as CatalogItem[];
  }
}
