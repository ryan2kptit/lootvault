import type { CatalogItem } from "./catalog-item";
import { orderTotal, priceLines } from "./pricing";

describe("pricing", () => {
  const items = new Map<string, CatalogItem>([
    ["a", { id: "a", storeId: "s", storeSlug: "s", ownerAddress: "0x90f79bf6eb2c4f870365e785982e1f101e93b906", tokenId: "7", name: "A", imageUrl: "u", status: "LIVE", priceWei: "1000000000000000000", supply: 5, sold: 0 }],
    ["b", { id: "b", storeId: "s", storeSlug: "s", ownerAddress: "0x90f79bf6eb2c4f870365e785982e1f101e93b906", tokenId: "8", name: "B", imageUrl: "u", status: "LIVE", priceWei: "3", supply: 9, sold: 0 }],
  ]);

  it("signs the listed price per copy and carries creator + edition size", () => {
    const [line] = priceLines([{ itemId: "a", quantity: 2 }], items);
    expect(line).toMatchObject({ tokenId: "7", unitPriceWei: 10n ** 18n, quantity: 2, maxSupply: 5, creator: "0x90f79bf6eb2c4f870365e785982e1f101e93b906" });
  });

  it("refuses to sign a malformed catalog price", () => {
    for (const priceWei of ["0", "", "-5", "1.5", "1e18", "0x10", " 7", "abc"]) {
      const bad = new Map<string, CatalogItem>([["a", { ...items.get("a")!, priceWei }]]);
      let error: unknown;
      try {
        priceLines([{ itemId: "a", quantity: 1 }], bad);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({ code: "ITEM_UNAVAILABLE", details: { itemId: "a" } });
    }
  });

  it("totals with bigint precision", () => {
    expect(orderTotal(priceLines([{ itemId: "a", quantity: 2 }, { itemId: "b", quantity: 3 }], items))).toBe(2n * 10n ** 18n + 9n);
  });
});
