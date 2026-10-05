import { describe, expect, it } from "vitest";

import { ethToWei, formatEth, shortAddress, weiToEthInput } from "./format";

describe("formatEth", () => {
  it.each([
    ["15000000000000000", "0.015 ETH"],
    ["1000000000000000000", "1 ETH"],
    ["0", "0 ETH"],
    ["123456789000000000", "0.1234 ETH"],
    [2_500_000_000_000_000_000n, "2.5 ETH"],
  ])("%s wei -> %s", (wei, text) => {
    expect(formatEth(wei)).toBe(text);
  });

  it("honours maxDecimals", () => {
    expect(formatEth("123456789000000000", 2)).toBe("0.12 ETH");
  });

  it("keeps two significant digits of amounts smaller than maxDecimals instead of showing 0", () => {
    expect(formatEth("50000000000000")).toBe("0.00005 ETH");
    expect(formatEth("12345678901234")).toBe("0.000012 ETH");
    expect(formatEth("1")).toBe("0.000000000000000001 ETH");
  });
});

describe("ethToWei", () => {
  it.each([
    ["0.015", "15000000000000000"],
    ["1", "1000000000000000000"],
    [" 2.5 ", "2500000000000000000"],
    ["0.000000000000000001", "1"],
  ])("%s ETH -> %s wei", (input, wei) => {
    expect(ethToWei(input)).toBe(wei);
  });

  it.each(["", "0", "-1", "abc", "1e18", "0.0000000000000000001", "1,5"])("rejects %j", (input) => {
    expect(ethToWei(input)).toBeNull();
  });

  it("round-trips through weiToEthInput", () => {
    expect(weiToEthInput(ethToWei("0.015") ?? "")).toBe("0.015");
  });
});

it("shortens addresses", () => {
  expect(shortAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906")).toBe("0x90F7…b906");
});
