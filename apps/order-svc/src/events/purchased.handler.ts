import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { InboxService } from "@lootvault/nest-common";
import { type ChainEvent, EVENT_TYPES } from "@lootvault/shared";
import { type Model, Types } from "mongoose";

import { statusesThatCanBecome } from "../domain/order-state";
import { Order } from "../orders/order.schema";

/**
 * Marks an order PAID from its Purchased event. Shared by the confirm fast-path and the
 * order-q consumer; the inbox makes the second delivery a no-op.
 */
@Injectable()
export class PurchasedHandler {
  constructor(
    private readonly inbox: InboxService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  async handle(event: ChainEvent): Promise<void> {
    if (event.type !== EVENT_TYPES.Purchased) return;
    await this.inbox.runOnce(event, async (session) => {
      await this.orders.updateOne(
        { orderId: event.data.orderId, status: { $in: statusesThatCanBecome("PAID") } },
        {
          $set: {
            status: "PAID",
            txHash: event.txHash,
            paidAt: new Date(event.blockTimestamp * 1000),
            feeWei: Types.Decimal128.fromString(event.data.fee),
          },
        },
        { session },
      );
    });
  }
}
