"use client";

import { useEffect } from "react";
import { useStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

/** order-svc accepts 1-10 different items per checkout, 1-10 copies each. */
export const MAX_CART_LINES = 10;
export const MAX_LINE_QUANTITY = 10;

export interface CartLine {
  itemId: string;
  name: string;
  imageUrl: string;
  priceWei: string;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
  /** Adds copies of an item (merging with an existing line), capped by `available` and the per-line limit. */
  add: (line: Omit<CartLine, "quantity">, quantity: number, available: number) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  /** Lowers a line to what is still available (after SoldOut or INSUFFICIENT_STOCK); removes it at 0. */
  capQuantity: (itemId: string, available: number) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

/** Whole copies between 0 and the limit; anything that is not a finite number counts as 0. */
const clampQuantity = (quantity: number, max = MAX_LINE_QUANTITY) =>
  Number.isFinite(quantity) && Number.isFinite(max) ? Math.max(0, Math.min(Math.floor(quantity), Math.floor(max), MAX_LINE_QUANTITY)) : 0;

/** The valid lines of a persisted cart. Storage is untrusted: a corrupt quantity (null, NaN, fraction) must not reach the total. */
function restoreLines(persisted: unknown): CartLine[] {
  const lines = typeof persisted === "object" && persisted !== null && "lines" in persisted ? persisted.lines : [];
  return Array.isArray(lines) ? lines.filter((line: CartLine) => Number.isInteger(line?.quantity) && line.quantity >= 1) : [];
}

/** One cart per store, persisted under `cart:{slug}`. `storage` is injectable for tests. */
export function createCartStore(slug: string, storage?: StateStorage) {
  return createStore<CartState>()(
    persist(
      (set) => ({
        lines: [],
        add: (line, quantity, available) =>
          set(({ lines }) => {
            if (!Number.isFinite(quantity)) return { lines };
            const existing = lines.find((l) => l.itemId === line.itemId);
            const next = clampQuantity((existing?.quantity ?? 0) + quantity, available);
            if (existing) {
              return { lines: lines.map((l) => (l.itemId === line.itemId ? { ...l, ...line, quantity: next } : l)).filter((l) => l.quantity > 0) };
            }
            if (next === 0 || lines.length >= MAX_CART_LINES) return { lines };
            return { lines: [...lines, { ...line, quantity: next }] };
          }),
        setQuantity: (itemId, quantity) =>
          set(({ lines }) => ({
            lines: lines.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.max(1, clampQuantity(quantity)) } : l)),
          })),
        capQuantity: (itemId, available) =>
          set(({ lines }) => ({
            lines: lines
              .map((l) => (l.itemId === itemId ? { ...l, quantity: Math.min(l.quantity, clampQuantity(available)) } : l))
              .filter((l) => l.quantity > 0),
          })),
        remove: (itemId) => set(({ lines }) => ({ lines: lines.filter((l) => l.itemId !== itemId) })),
        clear: () => set({ lines: [] }),
      }),
      {
        name: `cart:${slug}`,
        storage: createJSONStorage(() => storage ?? localStorage),
        partialize: ({ lines }) => ({ lines }),
        merge: (persisted, current) => ({ ...current, lines: restoreLines(persisted) }),
        // Rehydrated in useCart after mount, so server and first client render agree (empty cart).
        skipHydration: true,
      },
    ),
  );
}

export function cartTotalWei(lines: CartLine[]): bigint {
  return lines.reduce((total, line) => total + BigInt(line.priceWei) * BigInt(line.quantity), 0n);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

type CartStore = ReturnType<typeof createCartStore>;

const stores = new Map<string, CartStore>();

function cartStoreFor(slug: string): CartStore {
  let store = stores.get(slug);
  if (!store) {
    store = createCartStore(slug);
    stores.set(slug, store);
  }
  return store;
}

/** The cart of one store: `const lines = useCart(slug, (cart) => cart.lines)`. */
export function useCart<T>(slug: string, selector: (state: CartState) => T): T {
  const store = cartStoreFor(slug);
  useEffect(() => {
    if (!store.persist.hasHydrated()) void store.persist.rehydrate();
  }, [store]);
  return useStore(store, selector);
}
