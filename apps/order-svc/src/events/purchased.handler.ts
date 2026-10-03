import { Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(PurchasedHandler.name);

  constructor(
    private readonly inbox: InboxService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  async handle(event: ChainEvent): Promise<void> {
    if (event.type !== EVENT_TYPES.Purchased) return;
    await this.inbox.runOnce(event, async (session) => {
      // Same check as the confirm fast path (TX_MISMATCH): the paid total must equal the order total.
      // Returning inside runOnce records the event, so a mismatching delivery is not retried forever.
      const order = await this.orders.findOne({ orderId: event.data.orderId }, { totalWei: 1 }).session(session);
      if (order && BigInt(event.data.total) !== BigInt(order.totalWei.toString())) {
        this.logger.warn(
          `Purchased ${event.id} paid ${event.data.total} but order ${event.data.orderId} totals ${order.totalWei.toString()}: not marking it PAID`,
        );
        return;
      }
      const result = await this.orders.updateOne(
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
      if (result.matchedCount === 0) {
        this.logger.warn(`Purchased ${event.id} matched no open order (unknown or already final): ${event.data.orderId}`);
      }
    });
  }
}
