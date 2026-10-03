import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Interval } from "@nestjs/schedule";
import { InjectConfig } from "@lootvault/nest-common";
import type { Model } from "mongoose";

import type { OrderConfig } from "../config";
import { statusesThatCanBecome } from "../domain/order-state";
import { Order } from "./order.schema";

/**
 * Expires PENDING orders whose signed checkout can no longer be used. The contract rejects any
 * purchase after the deadline, so after deadline + grace (indexer lag) no payment can still be in flight.
 * Local: every minute. AWS: an EventBridge schedule invokes sweep().
 */
@Injectable()
export class OrderSweeper {
  private readonly logger = new Logger(OrderSweeper.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectConfig() private readonly config: OrderConfig,
  ) {}

  @Interval(60_000)
  async tick(): Promise<void> {
    if (!this.config.SWEEPER_ENABLED) return;
    const expired = await this.sweep();
    if (expired > 0) this.logger.log(`Expired ${expired} order(s)`);
  }

  async sweep(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.config.EXPIRY_GRACE_SECONDS * 1000);
    const result = await this.orders.updateMany(
      { status: { $in: statusesThatCanBecome("EXPIRED") }, deadline: { $lt: cutoff } },
      { $set: { status: "EXPIRED" } },
    );
    return result.modifiedCount;
  }
}
