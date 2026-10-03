import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { EVENT_PUBLISHER, type EventPublisher, InjectConfig } from "@lootvault/nest-common";
import { toChainEvents } from "@lootvault/shared";
import type { Model } from "mongoose";

import { CHAIN_SOURCE, type ChainSource } from "./chain-source";
import type { IndexerConfig } from "./config";
import { Cursor } from "./cursor.schema";

/** The "chain was reset" warning repeats at most this often, so a quiet loop does not spam the log. */
const STALE_CURSOR_WARN_INTERVAL_MS = 60_000;

export interface TickResult {
  fromBlock: number;
  toBlock: number;
  published: number;
}

/**
 * At-least-once chain -> SNS bridge.
 * 1. read [cursor+1, min(head - confirmations, cursor + batch)]
 * 2. decode with the same toChainEvents() as order-svc's fast-path (same event ids)
 * 3. publish, THEN advance the cursor with a conditional update.
 * A crash between 2 and 3 republishes the same ids, which consumers' inboxes drop.
 */
@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private lastStaleWarning = 0;

  constructor(
    @InjectModel(Cursor.name) private readonly cursors: Model<Cursor>,
    @Inject(CHAIN_SOURCE) private readonly chain: ChainSource,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @InjectConfig() private readonly config: IndexerConfig,
  ) {}

  private get cursorId(): string {
    return `${this.config.CHAIN_ID}:${this.config.CONTRACT_ADDRESS}`;
  }

  async lastBlock(): Promise<number | null> {
    return (await this.cursors.findById(this.cursorId).lean())?.lastBlock ?? null;
  }

  /** Processes one batch; returns null when there is nothing new to read. */
  async tick(): Promise<TickResult | null> {
    const cursor = await this.cursors
      .findOneAndUpdate(
        { _id: this.cursorId },
        { $setOnInsert: { lastBlock: this.config.START_BLOCK - 1 } },
        { upsert: true, new: true },
      )
      .lean();
    const previous = cursor!.lastBlock;
    const head = await this.chain.getHead();
    const fromBlock = BigInt(previous) + 1n;
    const safeHead = head - BigInt(this.config.CONFIRMATIONS);
    this.warnIfCursorAhead(previous, head);
    const batchEnd = fromBlock + BigInt(this.config.BATCH_SIZE) - 1n;
    const toBlock = safeHead < batchEnd ? safeHead : batchEnd;
    if (toBlock < fromBlock) return null;

    const logs = await this.chain.getLogs(fromBlock, toBlock);
    const timestamps = new Map<bigint, number>();
    for (const blockNumber of new Set(logs.map((log) => log.blockNumber as bigint))) {
      timestamps.set(blockNumber, await this.chain.getBlockTimestamp(blockNumber));
    }
    const events = toChainEvents(logs, {
      chainId: this.config.CHAIN_ID,
      contract: this.config.CONTRACT_ADDRESS,
      blockTimestamp: (blockNumber) => timestamps.get(blockNumber)!,
    });
    if (events.length > 0) await this.publisher.publish(events);

    const advanced = await this.cursors.updateOne({ _id: this.cursorId, lastBlock: previous }, { $set: { lastBlock: Number(toBlock) } });
    if (advanced.modifiedCount === 0) {
      this.logger.warn(`Cursor moved by another instance while processing ${fromBlock}-${toBlock}; its events were republished`);
    }
    return { fromBlock: Number(fromBlock), toBlock: Number(toBlock), published: events.length };
  }

  /**
   * A cursor beyond the chain head means the chain restarted with a fresh volume: the stored cursor
   * and the projections built from the old chain no longer match it, and the indexer would idle silently.
   * Compared with the raw head, not the confirmed one, so a fresh deploy within CONFIRMATIONS blocks stays quiet.
   */
  private warnIfCursorAhead(cursor: number, head: bigint): void {
    if (BigInt(cursor) <= head || Date.now() - this.lastStaleWarning < STALE_CURSOR_WARN_INTERVAL_MS) return;
    this.lastStaleWarning = Date.now();
    this.logger.warn(
      `cursor ${cursor} is ahead of chain head ${head}: the chain was reset; run npm run infra:reset (the indexer cursor and the catalog/order projections belong to the old chain)`,
    );
  }

  /** Runs ticks until caught up or `budgetMs` elapses (a scheduled Lambda's loop). */
  async catchUp(budgetMs: number): Promise<number> {
    const started = Date.now();
    let published = 0;
    while (Date.now() - started < budgetMs) {
      const result = await this.tick();
      if (!result) break;
      published += result.published;
    }
    return published;
  }
}
