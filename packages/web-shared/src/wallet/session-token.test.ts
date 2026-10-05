import { describe, expect, it } from "vitest";

import { msUntilExpiry, tokenFor } from "./session-token";

const address = "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc";
const now = Date.parse("2026-10-03T12:00:00Z");
const session = { accessToken: "jwt-a", address, expiresAt: "2026-10-03T13:00:00Z" };

describe("tokenFor", () => {
  it("returns the token for the wallet that signed in, whatever the address casing", () => {
    expect(tokenFor(session, address, now)).toBe("jwt-a");
    expect(tokenFor(session, "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", now)).toBe("jwt-a");
  });

  it("returns nothing while another wallet is connected", () => {
    expect(tokenFor(session, "0x976EA74026E726554dB657fA54763abd0C3a0aa9", now)).toBeUndefined();
  });

  it("returns nothing without a connected wallet", () => {
    expect(tokenFor(session, undefined, now)).toBeUndefined();
  });

  it("returns nothing for an expired session or no session", () => {
    expect(tokenFor({ ...session, expiresAt: "2026-10-03T11:59:59Z" }, address, now)).toBeUndefined();
    expect(tokenFor(null, address, now)).toBeUndefined();
  });
});

describe("msUntilExpiry", () => {
  it("returns the milliseconds left for a future expiry", () => {
    expect(msUntilExpiry(session, now)).toBe(60 * 60 * 1000);
  });

  it("returns 0 for an expired, invalid or missing session", () => {
    expect(msUntilExpiry({ ...session, expiresAt: "2026-10-03T11:00:00Z" }, now)).toBe(0);
    expect(msUntilExpiry({ ...session, expiresAt: "2026-10-03T12:00:00Z" }, now)).toBe(0);
    expect(msUntilExpiry({ ...session, expiresAt: "not a date" }, now)).toBe(0);
    expect(msUntilExpiry(null, now)).toBe(0);
  });

  it("clamps to the largest delay setTimeout accepts", () => {
    expect(msUntilExpiry({ ...session, expiresAt: "2027-10-03T12:00:00Z" }, now)).toBe(2 ** 31 - 1);
  });
});
