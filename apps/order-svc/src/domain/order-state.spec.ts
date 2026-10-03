import { canTransition, statusesThatCanBecome } from "./order-state";

describe("order state machine", () => {
  it.each([
    ["PENDING", "PAID", true],
    ["PENDING", "EXPIRED", true],
    ["EXPIRED", "PAID", true],
    ["PAID", "EXPIRED", false],
    ["PAID", "PENDING", false],
    ["EXPIRED", "PENDING", false],
  ] as const)("%s -> %s allowed: %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it("derives the conditional-update guards", () => {
    expect(statusesThatCanBecome("PAID")).toEqual(["PENDING", "EXPIRED"]);
    expect(statusesThatCanBecome("EXPIRED")).toEqual(["PENDING"]);
  });
});
