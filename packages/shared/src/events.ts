import type { Address, Hex } from "viem";

export const EVENT_TYPES = {
  Purchased: "chain.Purchased",
  TransferSingle: "chain.TransferSingle",
  EditionLocked: "chain.EditionLocked",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Envelope published to SNS by the indexer and by order-svc's fast-path. */
export interface EventEnvelope<TType extends EventType, TData> {
  /** `${chainId}:${txHash}:${logIndex}`: identical whichever path published it. */
  id: string;
  type: TType;
  chainId: number;
  blockNumber: number;
  /** Unix seconds. */
  blockTimestamp: number;
  txHash: Hex;
  logIndex: number;
  correlationId?: string;
  data: TData;
}

/**
 * Wire conventions for every `data` payload:
 * - amounts and token ids are decimal strings (wei / `tokenIdToString`), so JSON stays lossless;
 * - addresses and hashes are lower-case.
 */
export interface PurchasedData {
  orderId: Hex;
  buyer: Address;
  total: string;
  fee: string;
}

export interface TransferSingleData {
  operator: Address;
  from: Address;
  to: Address;
  /** tokenId, decimal string. */
  id: string;
  value: string;
}

export interface EditionLockedData {
  /** tokenId, decimal string. */
  tokenId: string;
  creator: Address;
  maxSupply: string;
}

export type PurchasedEvent = EventEnvelope<typeof EVENT_TYPES.Purchased, PurchasedData>;
export type TransferSingleEvent = EventEnvelope<typeof EVENT_TYPES.TransferSingle, TransferSingleData>;
export type EditionLockedEvent = EventEnvelope<typeof EVENT_TYPES.EditionLocked, EditionLockedData>;
export type ChainEvent = PurchasedEvent | TransferSingleEvent | EditionLockedEvent;

export function eventId(chainId: number, txHash: Hex, logIndex: number): string {
  return `${chainId}:${txHash.toLowerCase()}:${logIndex}`;
}
