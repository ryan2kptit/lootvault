import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";

import { cartCount, cartTotalWei, createCartStore, MAX_LINE_QUANTITY } from "./cart-store";

const drake = { itemId: "a1", name: "Ember Drake", imageUrl: "http://img/a1.png", priceWei: "10000000000000000" };
const lynx = { itemId: "b2", name: "Shadow Lynx", imageUrl: "http://img/b2.png", priceWei: "15000000000000000" };

function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("cart store", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let cart: ReturnType<typeof createCartStore>;

  beforeEach(() => {
    storage = memoryStorage();
    cart = createCartStore("pixel-legends", storage);
  });

  it("adds items, merging repeated adds into one line", () => {
    cart.getState().add(drake, 1, 5);
    cart.getState().add(drake, 2, 5);
    cart.getState().add(lynx, 1, 5);
    expect(cart.getState().lines.map((l) => [l.itemId, l.quantity])).toEqual([
      ["a1", 3],
      ["b2", 1],
    ]);
  });

  it("caps a line at the available stock and at the per-line limit", () => {
    cart.getState().add(drake, 4, 3);
    expect(cart.getState().lines[0].quantity).toBe(3);
    cart.getState().add(lynx, 50, 100);
    expect(cart.getState().lines[1].quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("does not add a sold-out item, and drops it if it was already in the cart", () => {
    cart.getState().add(drake, 1, 0);
    expect(cart.getState().lines).toEqual([]);
    cart.getState().add(lynx, 2, 5);
    cart.getState().add(lynx, 1, 0);
    expect(cart.getState().lines).toEqual([]);
  });

  it("lowers a line after SoldOut / INSUFFICIENT_STOCK and drops it at zero", () => {
    cart.getState().add(drake, 5, 10);
    cart.getState().add(lynx, 2, 10);
    cart.getState().capQuantity("a1", 2);
    cart.getState().capQuantity("b2", 0);
    expect(cart.getState().lines.map((l) => [l.itemId, l.quantity])).toEqual([["a1", 2]]);
  });

  it("keeps quantities between 1 and the limit when edited", () => {
    cart.getState().add(drake, 2, 10);
    cart.getState().setQuantity("a1", 0);
    expect(cart.getState().lines[0].quantity).toBe(1);
    cart.getState().setQuantity("a1", 99);
    expect(cart.getState().lines[0].quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("removes and clears", () => {
    cart.getState().add(drake, 1, 10);
    cart.getState().add(lynx, 1, 10);
    cart.getState().remove("a1");
    expect(cart.getState().lines.map((l) => l.itemId)).toEqual(["b2"]);
    cart.getState().clear();
    expect(cart.getState().lines).toEqual([]);
  });

  it("persists one cart per store under cart:{slug}", async () => {
    cart.getState().add(drake, 2, 10);
    expect(JSON.parse(storage.data.get("cart:pixel-legends") ?? "{}").state.lines).toHaveLength(1);

    const reloaded = createCartStore("pixel-legends", storage);
    await reloaded.persist.rehydrate();
    expect(reloaded.getState().lines[0]).toMatchObject({ itemId: "a1", quantity: 2 });

    const otherStore = createCartStore("mythic-forge", storage);
    await otherStore.persist.rehydrate();
    expect(otherStore.getState().lines).toEqual([]);
  });

  it("ignores non-numeric quantities instead of storing NaN", () => {
    cart.getState().add(drake, 2, 10);
    cart.getState().add(drake, Number.NaN, 10);
    cart.getState().add(lynx, Number.NaN, 10);
    cart.getState().setQuantity("a1", Number.NaN);
    expect(cart.getState().lines.every((l) => Number.isInteger(l.quantity) && l.quantity >= 1)).toBe(true);
    expect(cartTotalWei(cart.getState().lines)).toBeGreaterThan(0n);
  });

  it("floors fractional quantities", () => {
    cart.getState().add(drake, 2.9, 10);
    expect(cart.getState().lines[0].quantity).toBe(2);
  });

  it("drops persisted lines whose quantity is not a positive integer when rehydrating", async () => {
    const line = { name: "x", imageUrl: "http://img/x.png", priceWei: "1" };
    const lines = [
      { ...line, itemId: "ok", quantity: 2 },
      { ...line, itemId: "null", quantity: null },
      { ...line, itemId: "zero", quantity: 0 },
      { ...line, itemId: "fraction", quantity: 1.5 },
    ];
    storage.data.set("cart:pixel-legends", JSON.stringify({ state: { lines }, version: 0 }));
    const reloaded = createCartStore("pixel-legends", storage);
    await reloaded.persist.rehydrate();
    expect(reloaded.getState().lines.map((l) => l.itemId)).toEqual(["ok"]);
    expect(cartTotalWei(reloaded.getState().lines)).toBe(2n);
  });

  it("totals price x quantity in wei and counts copies", () => {
    cart.getState().add(drake, 2, 10);
    cart.getState().add(lynx, 1, 10);
    expect(cartTotalWei(cart.getState().lines)).toBe(35_000_000_000_000_000n);
    expect(cartCount(cart.getState().lines)).toBe(3);
  });
});
