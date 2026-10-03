import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { InboxService } from "@lootvault/nest-common";
import {
  type ChainEvent,
  type EditionLockedEvent,
  EVENT_TYPES,
  isItemTokenId,
  itemIdFromTokenId,
  type TransferSingleEvent,
} from "@lootvault/shared";
import type { ClientSession, Model } from "mongoose";
import { zeroAddress } from "viem";

import { Holding, holdingId } from "../holdings/holding.schema";
import { Item } from "../items/item.schema";

/**
 * Catalog's projections of chain state. Every event goes through the inbox, so redelivery
 * (SQS retries, fast-path + indexer publishing the same log) changes nothing.
 * Tokens that do not belong to a catalog item (e.g. minted with a leaked key) are ignored.
 */
@Injectable()
export class CatalogEventsHandler {
  constructor(
    private readonly inbox: InboxService,
    @InjectModel(Item.name) private readonly items: Model<Item>,
    @InjectModel(Holding.name) private readonly holdings: Model<Holding>,
  ) {}

  async handle(event: ChainEvent): Promise<void> {
    switch (event.type) {
      case EVENT_TYPES.EditionLocked:
        await this.inbox.runOnce(event, (session) => this.onEditionLocked(event, session));
        return;
      case EVENT_TYPES.TransferSingle:
        await this.inbox.runOnce(event, (session) => this.onTransfer(event, session));
        return;
      default:
        return; // Purchased is order-svc's concern.
    }
  }

  /** The chain fixed the edition size at the first sale; mirror it. */
  private async onEditionLocked(event: EditionLockedEvent, session: ClientSession): Promise<void> {
    await this.items.updateOne({ tokenId: event.data.tokenId }, { $set: { supply: Number(event.data.maxSupply) } }, { session });
  }

  private async onTransfer(event: TransferSingleEvent, session: ClientSession): Promise<void> {
    const { from, to, id: tokenId, value } = event.data;
    if (!isItemTokenId(BigInt(tokenId))) return;
    const itemId = itemIdFromTokenId(BigInt(tokenId));
    if (!(await this.items.exists({ _id: itemId }).session(session))) return;

    const amount = Number(value);
    if (from === zeroAddress) {
      await this.items.updateOne({ _id: itemId }, { $inc: { sold: amount } }, { session });
    } else {
      await this.holdings.updateOne({ _id: holdingId(from, tokenId) }, { $inc: { balance: -amount } }, { session });
    }
    if (to !== zeroAddress) {
      await this.holdings.updateOne(
        { _id: holdingId(to, tokenId) },
        { $inc: { balance: amount }, $setOnInsert: { address: to, tokenId, itemId } },
        { upsert: true, session },
      );
    }
  }
}
