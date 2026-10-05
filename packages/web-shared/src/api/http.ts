import { ApiError } from "./errors";

/** Backend services, named after their route prefix (`/auth`, `/catalog`, `/orders`). */
export const SERVICES = ["auth", "catalog", "orders"] as const;
export type Service = (typeof SERVICES)[number];

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  query?: object;
  body?: unknown;
}

export interface HttpClientOptions {
  /** Base URL of a service, including its prefix: `/api/catalog` in the browser, `http://localhost:3002/catalog` on the server. */
  baseUrl: (service: Service) => string;
  /** Bearer token for the current user, if signed in. */
  getToken?: () => string | null;
  /** Called on a 401 for an authenticated request, so the app can drop the session and ask for a new sign-in. */
  onUnauthorized?: () => void;
  /** Extra fetch options, e.g. `{ cache: "no-store" }` for server rendering. */
  init?: RequestInit;
}

export type HttpClient = <T>(service: Service, path: string, options?: RequestOptions) => Promise<T>;

export function createHttpClient({ baseUrl, getToken, onUnauthorized, init }: HttpClientOptions): HttpClient {
  return async <T>(service: Service, path: string, { method = "GET", query, body }: RequestOptions = {}) => {
    const token = getToken?.() ?? null;
    let response: Response;
    try {
      response = await fetch(`${baseUrl(service)}${path}${toQueryString(query)}`, {
        ...init,
        method,
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // fetch rejects with a TypeError when the server cannot be reached. Anything else (e.g. Next's
      // dynamic-rendering signal for `cache: "no-store"` during a build) must pass through untouched.
      throw error instanceof TypeError ? ApiError.network() : error;
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      if (response.status === 401 && token) onUnauthorized?.();
      throw ApiError.fromResponse(response.status, payload);
    }
    return payload as T;
  };
}

function toQueryString(query: object | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}) as [string, QueryValue][]) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
