import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors";
import { createHttpClient } from "./http";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(token: string | null, onUnauthorized = vi.fn()) {
  return { http: createHttpClient({ baseUrl: (service) => `/api/${service}`, getToken: () => token, onUnauthorized }), onUnauthorized };
}

describe("createHttpClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the URL from the service and the query, skipping empty values, and sends the bearer token", async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { items: [] }));
    vi.stubGlobal("fetch", fetch);
    await client("jwt").http("catalog", "/stores/x/items", { query: { q: "drake", minPrice: undefined, inStock: true, sort: "" } });
    expect(fetch).toHaveBeenCalledWith("/api/catalog/stores/x/items?q=drake&inStock=true", expect.objectContaining({ method: "GET", headers: { authorization: "Bearer jwt" } }));
  });

  it("turns an error envelope into an ApiError and reports a 401 so the app can sign in again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } })));
    const { http, onUnauthorized } = client("expired");
    await expect(http("orders", "/me")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("maps an unreachable server to NETWORK_ERROR but lets other failures through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(client(null).http("auth", "/nonce")).rejects.toBeInstanceOf(ApiError);

    const signal = new Error("Dynamic server usage");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(signal));
    await expect(client(null).http("auth", "/nonce")).rejects.toBe(signal);
  });
});
