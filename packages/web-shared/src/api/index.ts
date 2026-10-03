import { authApi } from "./auth";
import { catalogApi } from "./catalog";
import { createHttpClient, type HttpClientOptions } from "./http";
import { ordersApi } from "./orders";

export { ApiError, isApiError } from "./errors";
export { serviceOrigin } from "./service-origin";
export * from "./types";
export { MAX_IMAGE_BYTES, uploadImage } from "./upload";

/** Typed functions for every backend route, grouped by service: `api.catalog.getItem(id)`. */
export function createApi(options: HttpClientOptions) {
  const http = createHttpClient(options);
  return { auth: authApi(http), catalog: catalogApi(http), orders: ordersApi(http) };
}

export type Api = ReturnType<typeof createApi>;
