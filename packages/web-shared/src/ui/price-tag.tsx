import { formatEth } from "../format";
import { cn } from "./cn";

/** A wei amount shown in ETH. */
export function PriceTag({ wei, className }: { wei: bigint | string; className?: string }) {
  return <span className={cn("font-semibold tabular-nums", className)}>{formatEth(wei)}</span>;
}
