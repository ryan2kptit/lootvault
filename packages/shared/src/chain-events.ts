import { parseEventLogs, type Address, type Hex, type Log } from "viem";

import { lootVault1155Abi } from "./abi/lootVault1155";
import { EVENT_TYPES, eventId, type ChainEvent } from "./events";

export interface ChainEventContext {
  chainId: number;
  /** LootVault1155 address. Logs emitted by any other contract are ignored (they could be forged). */
  contract: Address;
  /** Unix seconds of the block a log was mined in. */
  blockTimestamp: (blockNumber: bigint) => number;
  correlationId?: string;
}

const lower = <T extends string>(value: T) => value.toLowerCase() as T;

/**
 * Turn raw logs into chain events. The order-svc fast-path (one receipt) and the indexer
 * (getLogs ranges) both call this, so a log always yields the same event with the same id.
 * Unrelated events and logs from other contracts are dropped; output is sorted by (block, logIndex).
 */
export function toChainEvents(logs: Log[], ctx: ChainEventContext): ChainEvent[] {
  const contract = lower(ctx.contract);
  const ours = logs.filter((log) => lower(log.address) === contract && log.blockNumber !== null);
  const parsed = parseEventLogs({
    abi: lootVault1155Abi,
    logs: ours,
    eventName: ["Purchased", "TransferSingle", "EditionLocked"],
  });

  const events = parsed.map((log): ChainEvent => {
    const blockNumber = log.blockNumber as bigint;
    const txHash = lower(log.transactionHash as Hex);
    const logIndex = log.logIndex as number;
    const base = {
      id: eventId(ctx.chainId, txHash, logIndex),
      chainId: ctx.chainId,
      blockNumber: Number(blockNumber),
      blockTimestamp: ctx.blockTimestamp(blockNumber),
      txHash,
      logIndex,
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    };
    switch (log.eventName) {
      case "Purchased":
        return {
          ...base,
          type: EVENT_TYPES.Purchased,
          data: {
            orderId: lower(log.args.orderId),
            buyer: lower(log.args.buyer),
            total: log.args.total.toString(),
            fee: log.args.fee.toString(),
          },
        };
      case "TransferSingle":
        return {
          ...base,
          type: EVENT_TYPES.TransferSingle,
          data: {
            operator: lower(log.args.operator),
            from: lower(log.args.from),
            to: lower(log.args.to),
            id: log.args.id.toString(),
            value: log.args.value.toString(),
          },
        };
      case "EditionLocked":
        return {
          ...base,
          type: EVENT_TYPES.EditionLocked,
          data: {
            tokenId: log.args.tokenId.toString(),
            creator: lower(log.args.creator),
            maxSupply: log.args.maxSupply.toString(),
          },
        };
    }
  });

  return events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}
