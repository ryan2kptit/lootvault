import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENT_TYPES, eventId } from "./events";

describe("events", () => {
  it("builds deterministic event ids with a lower-cased tx hash", () => {
    assert.equal(eventId(31337, "0xABCDEF", 3), "31337:0xabcdef:3");
  });

  it("exposes the two chain event types", () => {
    assert.deepEqual(EVENT_TYPES, { Purchased: "chain.Purchased", TransferSingle: "chain.TransferSingle" });
  });
});
