import type { Service } from "./http";

/** Server-side env var holding each service's origin. Used for SSR fetches and for the `/api/*` rewrites. */
const ORIGIN_ENV: Record<Service, string> = { auth: "AUTH_URL", catalog: "CATALOG_URL", orders: "ORDER_URL" };

export const SERVICE_ORIGIN_ENV = Object.values(ORIGIN_ENV);

/** e.g. `http://localhost:3002` for "catalog". Server only: these variables are not exposed to the browser. */
export function serviceOrigin(service: Service): string {
  const origin = process.env[ORIGIN_ENV[service]];
  if (!origin) throw new Error(`${ORIGIN_ENV[service]} is not set`);
  return origin.replace(/\/+$/, "");
}
