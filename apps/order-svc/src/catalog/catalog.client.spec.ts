import { HttpCatalogClient } from "./catalog.client";

describe("HttpCatalogClient", () => {
  const realFetch = global.fetch;
  const client = new HttpCatalogClient("http://catalog.test", "internal-secret", 50);
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  const reply = (body: string, init?: ResponseInit) => fetchMock.mockResolvedValueOnce(new Response(body, init));
  const failsClosed = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: "CATALOG_UNAVAILABLE", status: 503 });

  it("returns the items from a 200 array response", async () => {
    const items = [{ id: "a", priceWei: "5" }];
    reply(JSON.stringify(items), { status: 200 });
    await expect(client.getItems(["a"])).resolves.toEqual(items);
  });

  it("fails closed with 503 CATALOG_UNAVAILABLE on a 500", async () => {
    reply("boom", { status: 500 });
    await failsClosed(client.getItems(["a"]));
  });

  it("fails closed on a 200 with a non-JSON body", async () => {
    reply("<html>not json</html>", { status: 200 });
    await failsClosed(client.getItems(["a"]));
  });

  it("fails closed on a 200 with a non-array body", async () => {
    reply(JSON.stringify({ items: [] }), { status: 200 });
    await failsClosed(client.getItems(["a"]));
  });

  it("fails closed when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await failsClosed(client.getItems(["a"]));
  });

  it("never follows redirects and sends the internal key, ids and request id", async () => {
    reply("[]", { status: 200 });
    await client.getItems(["a", "b"], "req-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://catalog.test/catalog/internal/items/batch");
    expect(init).toMatchObject({ method: "POST", redirect: "error", body: JSON.stringify({ ids: ["a", "b"] }) });
    expect(init.headers).toMatchObject({ "x-internal-key": "internal-secret", "x-request-id": "req-1" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
