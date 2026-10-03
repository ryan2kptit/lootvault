import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AppError, EVENT_PUBLISHER, type EventPublisher } from "@lootvault/nest-common";
import { createTestApp } from "@lootvault/nest-common/testing";
import { type ChainEvent, lootVault1155Abi } from "@lootvault/shared";
import { encodeAbiParameters, encodeEventTopics, getAbiItem, type Hex, type Log, type TransactionReceipt } from "viem";

import { AppModule } from "./app.module";
import { CATALOG_CLIENT, type CatalogClient } from "./catalog/catalog.client";
import { CHAIN_READER, type ChainReader } from "./chain/chain-reader";
import type { CatalogItem } from "./domain/catalog-item";

export const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
export const PLATFORM = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export class FakeCatalog implements CatalogClient {
  readonly items = new Map<string, CatalogItem>();
  down = false;

  async getItems(ids: string[]): Promise<CatalogItem[]> {
    if (this.down) throw new AppError("CATALOG_UNAVAILABLE", 503, "Catalog is unavailable, please retry");
    return ids.flatMap((id) => (this.items.has(id) ? [this.items.get(id)!] : []));
  }
}

export class FakeChain implements ChainReader {
  readonly receipts = new Map<string, TransactionReceipt>();
  /** Chain head; receipts are mined in block 12. */
  head = 12n;

  async getReceipt(txHash: Hex) {
    return this.receipts.get(txHash.toLowerCase()) ?? null;
  }

  async getBlockTimestamp() {
    return 1_700_000_000;
  }

  async getBlockNumber() {
    return this.head;
  }
}

export class FakePublisher implements EventPublisher {
  readonly published: ChainEvent[] = [];

  async publish(events: ChainEvent[]) {
    this.published.push(...events);
  }
}

export async function createOrderTestApp(
  mongoUri: string,
  fakes: { catalog: FakeCatalog; chain: FakeChain; publisher: FakePublisher },
  envOverrides: Record<string, string> = {},
) {
  return createTestApp(AppModule, {
    prefix: "orders",
    env: {
      MONGO_URL: mongoUri,
      ORDER_DB: `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      JWT_SECRET: "test-secret-at-least-16",
      INTERNAL_API_KEY: "internal-key-for-tests",
      CHAIN_ID: "31337",
      RPC_URL: "http://127.0.0.1:1",
      CONTRACT_ADDRESS: CONTRACT,
      PLATFORM_SIGNER_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      SQS_POLLING: "false",
      SWEEPER_ENABLED: "false",
      // The shared e2e buyer holds many PENDING orders; the cap and confirmations have their own tests.
      MAX_PENDING_ORDERS_PER_BUYER: "100",
      CONFIRMATIONS: "0",
      ...envOverrides,
    },
    override: (builder) =>
      builder
        .overrideProvider(CATALOG_CLIENT)
        .useValue(fakes.catalog)
        .overrideProvider(CHAIN_READER)
        .useValue(fakes.chain)
        .overrideProvider(EVENT_PUBLISHER)
        .useValue(fakes.publisher),
  });
}

export const bearer = (app: INestApplication, address: string) =>
  `Bearer ${app.get(JwtService).sign({ sub: address.toLowerCase() })}`;

type EventName = "Purchased" | "TransferSingle" | "EditionLocked";

export function encodeLog(eventName: EventName, args: Record<string, unknown>, logIndex: number, address: string = CONTRACT): Log {
  const item = getAbiItem({ abi: lootVault1155Abi, name: eventName }) as { inputs: readonly { name: string; type: string; indexed?: boolean }[] };
  const nonIndexed = item.inputs.filter((input) => !input.indexed);
  return {
    address,
    topics: encodeEventTopics({ abi: lootVault1155Abi, eventName, args } as never) as Log["topics"],
    data: encodeAbiParameters(nonIndexed, nonIndexed.map((input) => args[input.name])),
    blockNumber: 12n,
    blockHash: `0x${"cd".repeat(32)}`,
    logIndex,
    transactionHash: `0x${"0".repeat(63)}1`,
    transactionIndex: 0,
    removed: false,
  } as Log;
}

export function receipt(txHash: Hex, logs: Log[], overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    transactionHash: txHash,
    status: "success",
    to: CONTRACT,
    blockNumber: 12n,
    logs: logs.map((log) => ({ ...log, transactionHash: txHash })),
    ...overrides,
  } as TransactionReceipt;
}
