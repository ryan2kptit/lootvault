import { formatEther, parseEther } from "viem";

/**
 * Wei (bigint or decimal string) -> "0.015 ETH", rounded down to `maxDecimals`.
 * A non-zero amount below that precision keeps two significant digits ("0.00005 ETH"), never "0 ETH".
 */
export function formatEth(wei: bigint | string, maxDecimals = 4): string {
  const [whole, fraction = ""] = formatEther(BigInt(wei)).split(".");
  let digits = fraction.slice(0, maxDecimals);
  if (whole === "0" && /^0*$/.test(digits) && /[1-9]/.test(fraction)) {
    const firstSignificant = fraction.search(/[1-9]/);
    digits = fraction.slice(0, firstSignificant + 2);
  }
  const trimmed = digits.replace(/0+$/, "");
  return `${whole}${trimmed ? `.${trimmed}` : ""} ETH`;
}

/** User input in ETH -> wei string, or null when it is not a positive amount with at most 18 decimals. */
export function ethToWei(input: string): string | null {
  const value = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(value)) return null;
  const wei = parseEther(value);
  return wei > 0n ? wei.toString() : null;
}

/** Wei -> plain ETH number string for form fields ("0.015"). */
export function weiToEthInput(wei: string): string {
  return formatEther(BigInt(wei));
}

/** 0x90F79bf6EB2c4f870365E785982E1f101E93b906 -> 0x90F7…b906 */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
