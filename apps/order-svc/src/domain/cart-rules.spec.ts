import type { CatalogItem } from "./catalog-item";
import { assertCheckoutable, validateCart } from "./cart-rules";

const item = (overrides: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "a".repeat(24),
  storeId: "s1",
  storeSlug: "store",
  ownerAddress: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  tokenId: "1",
  name: "Card",
  imageUrl: "http://x/y.png",
  status: "LIVE",
  priceWei: "100",
  supply: 5,
  sold: 0,
  ...overrides,
});

const codeOf = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "OK";
};

describe("validateCart", () => {
  it.each([
    [[], "CART_INVALID"],
    [[{ itemId: "a", quantity: 0 }], "CART_INVALID"],
    [[{ itemId: "a", quantity: 11 }], "CART_INVALID"],
    [[{ itemId: "a", quantity: 1 }, { itemId: "a", quantity: 1 }], "CART_INVALID"],
    [Array.from({ length: 11 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 })), "CART_INVALID"],
    [[{ itemId: "a", quantity: 10 }], "OK"],
  ])("%j -> %s", (lines, expected) => {
    expect(codeOf(() => validateCart(lines))).toBe(expected);
  });
});

describe("assertCheckoutable", () => {
  const a = item({ id: "a" });
  const b = item({ id: "b", storeId: "s2" });

  it("rejects missing or unpublished items", () => {
    expect(codeOf(() => assertCheckoutable([{ itemId: "zz", quantity: 1 }], new Map([["a", a]]), new Map()))).toBe("ITEM_UNAVAILABLE");
    const hidden = item({ id: "h", status: "HIDDEN" });
    expect(codeOf(() => assertCheckoutable([{ itemId: "h", quantity: 1 }], new Map([["h", hidden]]), new Map()))).toBe("ITEM_UNAVAILABLE");
  });

  it("rejects carts spanning two stores", () => {
    const lines = [{ itemId: "a", quantity: 1 }, { itemId: "b", quantity: 1 }];
    expect(codeOf(() => assertCheckoutable(lines, new Map([["a", a], ["b", b]]), new Map()))).toBe("MIXED_STORES");
  });

  it("counts sold and pending copies against the supply", () => {
    const nearlyGone = item({ id: "a", supply: 5, sold: 3 });
    const items = new Map([["a", nearlyGone]]);
    expect(codeOf(() => assertCheckoutable([{ itemId: "a", quantity: 2 }], items, new Map()))).toBe("OK");
    expect(codeOf(() => assertCheckoutable([{ itemId: "a", quantity: 2 }], items, new Map([["a", 1]])))).toBe("INSUFFICIENT_STOCK");
  });
});
