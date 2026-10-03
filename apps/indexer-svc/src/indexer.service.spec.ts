import type { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { EVENT_PUBLISHER, type EventPublisher } from "@lootvault/nest-common";
import { createTestApp, startMongo } from "@lootvault/nest-common/testing";
import { type ChainEvent, lootVault1155Abi } from "@lootvault/shared";
import type { Model } from "mongoose";
import { encodeAbiParameters, encodeEventTopics, getAbiItem, type Log } from "viem";

import { AppModule } from "./app.module";
import { CHAIN_SOURCE, type ChainSource } from "./chain-source";
import { Cursor } from "./cursor.schema";
import { IndexerService } from "./indexer.service";

const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const BUYER = "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc";
const ZERO = "0x0000000000000000000000000000000000000000";

function mintLog(block: bigint, logIndex: number): Log {
  const item = getAbiItem({ abi: lootVault1155Abi, name: "TransferSingle" }) as { inputs: readonly { name: string; type: string; indexed?: boolean }[] };
  const args = { operator: BUYER, from: ZERO, to: BUYER, id: block, value: 1n } as Record<string, unknown>;
  const data = item.inputs.filter((i) => !i.indexed);
  return {
    address: CONTRACT,
    topics: encodeEventTopics({ abi: lootVault1155Abi, eventName: "TransferSingle", args } as never) as Log["topics"],
    data: encodeAbiParameters(data, data.map((i) => args[i.name])),
    blockNumber: block,
    blockHash: `0x${"cd".repeat(32)}`,
    logIndex,
    transactionHash: `0x${block.toString(16).padStart(64, "0")}`,
    transactionIndex: 0,
    removed: false,
  } as Log;
}

class FakeChain implements ChainSource {
  head = 0n;
  logs: Log[] = [];
  onGetLogs?: () => Promise<void>;

  async getHead() {
    return this.head;
  }

  async getLogs(from: bigint, to: bigint) {
    await this.onGetLogs?.();
    return this.logs.filter((l) => l.blockNumber! >= from && l.blockNumber! <= to);
  }

  async getBlockTimestamp(block: bigint) {
    return 1_700_000_000 + Number(block);
  }
}

class FakePublisher implements EventPublisher {
  published: ChainEvent[] = [];
  failNext = false;

  async publish(events: ChainEvent[]) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("SNS unavailable");
    }
    this.published.push(...events);
  }
}

describe("IndexerService", () => {
  let mongo: Awaited<ReturnType<typeof startMongo>>;
  let app: INestApplication;
  let indexer: IndexerService;
  let cursors: Model<Cursor>;
  const chain = new FakeChain();
  const publisher = new FakePublisher();

  async function boot(env: Record<string, string>) {
    app = await createTestApp(AppModule, {
      prefix: "indexer",
      env: {
        MONGO_URL: mongo.uri,
        INDEXER_DB: `indexer_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        CHAIN_ID: "31337",
        RPC_URL: "http://127.0.0.1:1",
        CONTRACT_ADDRESS: CONTRACT,
        SNS_TOPIC_ARN: "arn:aws:sns:test",
        INDEXER_LOOP: "false",
        ...env,
      },
      override: (b) => b.overrideProvider(CHAIN_SOURCE).useValue(chain).overrideProvider(EVENT_PUBLISHER).useValue(publisher),
    });
    indexer = app.get(IndexerService);
    cursors = app.get(getModelToken(Cursor.name));
  }

  beforeAll(async () => {
    mongo = await startMongo();
  });

  afterEach(async () => {
    await app.close();
    publisher.published = [];
    chain.onGetLogs = undefined;
  });

  afterAll(async () => {
    await mongo.stop();
  });

  it("starts at START_BLOCK (inclusive), batches, publishes in order and stops when caught up", async () => {
    chain.head = 9n;
    chain.logs = [mintLog(4n, 0), mintLog(5n, 1), mintLog(5n, 0), mintLog(8n, 0)];
    await boot({ START_BLOCK: "5", BATCH_SIZE: "2", CONFIRMATIONS: "0" });

    expect(await indexer.tick()).toEqual({ fromBlock: 5, toBlock: 6, published: 2 });
    expect(await indexer.tick()).toEqual({ fromBlock: 7, toBlock: 8, published: 1 });
    expect(await indexer.tick()).toEqual({ fromBlock: 9, toBlock: 9, published: 0 });
    expect(await indexer.tick()).toBeNull();
    expect(publisher.published.map((e) => `${e.blockNumber}:${e.logIndex}`)).toEqual(["5:0", "5:1", "8:0"]);
    expect(await indexer.lastBlock()).toBe(9);
  });

  it("waits for confirmations", async () => {
    chain.head = 10n;
    chain.logs = [mintLog(9n, 0)];
    await boot({ START_BLOCK: "1", BATCH_SIZE: "500", CONFIRMATIONS: "3" });
    expect(await indexer.tick()).toEqual({ fromBlock: 1, toBlock: 7, published: 0 });
    chain.head = 12n;
    expect(await indexer.tick()).toEqual({ fromBlock: 8, toBlock: 9, published: 1 });
  });

  it("does not advance the cursor when publishing fails, so the same event ids are retried", async () => {
    chain.head = 3n;
    chain.logs = [mintLog(2n, 0)];
    await boot({ START_BLOCK: "1", BATCH_SIZE: "500", CONFIRMATIONS: "0" });

    publisher.failNext = true;
    await expect(indexer.tick()).rejects.toThrow("SNS unavailable");
    expect(await indexer.lastBlock()).toBe(0);

    await indexer.tick();
    expect(publisher.published.map((e) => e.id)).toEqual([`31337:${mintLog(2n, 0).transactionHash}:0`]);
    expect(await indexer.lastBlock()).toBe(3);
  });

  it("leaves the cursor alone if another instance advanced it meanwhile", async () => {
    chain.head = 5n;
    chain.logs = [];
    await boot({ START_BLOCK: "1", BATCH_SIZE: "500", CONFIRMATIONS: "0" });
    await indexer.tick(); // creates cursor at 5
    chain.head = 20n;
    chain.onGetLogs = async () => {
      await cursors.updateOne({}, { $set: { lastBlock: 15 } }); // a concurrent instance wins
    };
    await indexer.tick();
    expect(await indexer.lastBlock()).toBe(15);
  });

  it("catches up within a time budget", async () => {
    chain.head = 30n;
    chain.logs = [mintLog(10n, 0), mintLog(25n, 0)];
    await boot({ START_BLOCK: "1", BATCH_SIZE: "10", CONFIRMATIONS: "0" });
    expect(await indexer.catchUp(5_000)).toBe(2);
    expect(await indexer.lastBlock()).toBe(30);
  });
});
