import { describe, expect, it } from "vitest";

import { ApiError } from "./errors";

const envelope = (code: string, message: string, details?: unknown) => ({ error: { code, message, details } });

describe("ApiError.fromResponse", () => {
  it("explains INSUFFICIENT_STOCK with the available quantity and keeps the details", () => {
    const error = ApiError.fromResponse(409, envelope("INSUFFICIENT_STOCK", 'Only 2 left of "Drake"', { itemId: "abc", available: 2 }));
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.message).toBe("Only 2 left. Lower the quantity and try again.");
    expect(error.detail("itemId")).toBe("abc");
  });

  it("says sold out when nothing is available", () => {
    expect(ApiError.fromResponse(409, envelope("INSUFFICIENT_STOCK", "x", { available: 0 })).message).toBe("Sold out: no copies are left.");
  });

  it("uses details.max for TOO_MANY_PENDING_ORDERS", () => {
    expect(ApiError.fromResponse(429, envelope("TOO_MANY_PENDING_ORDERS", "x", { max: 3 })).message).toBe(
      "You already have 3 open checkouts. Finish one or wait for it to expire.",
    );
  });

  it.each([
    ["ITEM_UNAVAILABLE", 409, "An item in your cart is no longer for sale."],
    ["MIXED_STORES", 400, "A cart can only hold items from one store."],
    ["CATALOG_UNAVAILABLE", 503, "The catalog is temporarily unavailable. Please try again in a moment."],
    ["SUPPLY_LOCKED", 409, "Supply is locked: the edition size was fixed on-chain at the first sale."],
    ["IMAGE_NOT_HOSTED", 400, "Upload the image through LootVault before saving."],
    ["TX_INVALID", 422, "The transaction did not succeed on-chain."],
    ["TX_MISMATCH", 422, "This transaction does not pay for this order."],
    ["SLUG_TAKEN", 409, "That store URL is already taken. Choose another slug."],
  ])("maps %s to a readable message", (code, status, message) => {
    expect(ApiError.fromResponse(status, envelope(code, "server text")).message).toBe(message);
  });

  it("treats 401 as an expired session, even without an envelope", () => {
    const error = ApiError.fromResponse(401, undefined);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.isUnauthorized).toBe(true);
    expect(error.message).toBe("Your session has expired. Please sign in again.");
  });

  it("joins validation messages", () => {
    const error = ApiError.fromResponse(400, envelope("VALIDATION_FAILED", "Request validation failed", ["slug must be 3-32 chars", "name too long"]));
    expect(error.message).toBe("slug must be 3-32 chars. name too long.");
  });

  it("falls back to the server message for unknown codes, and to a generic one for non-JSON bodies", () => {
    expect(ApiError.fromResponse(418, envelope("TEAPOT", "I am a teapot")).message).toBe("I am a teapot");
    expect(ApiError.fromResponse(502, "<html>Bad gateway</html>").message).toBe("Something went wrong. Please try again.");
  });
});
