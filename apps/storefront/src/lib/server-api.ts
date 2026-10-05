import { createApi, isApiError, serviceOrigin } from "@lootvault/web-shared/api";
import { notFound } from "next/navigation";
import { cache } from "react";

/** API client for server components: calls the services directly, never cached (stock changes all the time). */
export const serverApi = createApi({
  baseUrl: (service) => `${serviceOrigin(service)}/${service}`,
  init: { cache: "no-store" },
});

/** Resolves a lookup, turning a backend 404 into the route's not-found page. */
export async function orNotFound<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

// Memoised per request, so a layout, its page and generateMetadata share one fetch.
export const getStore = cache((slug: string) => orNotFound(serverApi.catalog.getStore(slug)));
export const getItem = cache((id: string) => orNotFound(serverApi.catalog.getItem(id)));
