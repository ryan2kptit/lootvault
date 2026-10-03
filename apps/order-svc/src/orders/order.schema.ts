import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, Types } from "mongoose";

import { ORDER_STATUSES, type OrderStatus } from "../domain/order-state";

@Schema({ _id: false, versionKey: false })
export class OrderLine {
  @Prop({ required: true })
  itemId: string;

  @Prop({ required: true })
  tokenId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ type: Types.Decimal128, required: true })
  unitPriceWei: Types.Decimal128;
}

@Schema({ collection: "orders", versionKey: false, timestamps: true })
export class Order {
  /** bytes32 hex (lower-case) used on-chain; single-use per the contract. */
  @Prop({ required: true, unique: true })
  orderId: string;

  @Prop({ required: true })
  buyer: string;

  @Prop({ required: true })
  storeId: string;

  @Prop({ required: true })
  storeSlug: string;

  @Prop({ required: true })
  sellerAddress: string;

  @Prop({ type: [SchemaFactory.createForClass(OrderLine)], required: true })
  lines: OrderLine[];

  @Prop({ type: Types.Decimal128, required: true })
  totalWei: Types.Decimal128;

  @Prop({ type: Types.Decimal128 })
  feeWei?: Types.Decimal128;

  @Prop({ type: String, enum: ORDER_STATUSES, default: "PENDING" })
  status: OrderStatus;

  @Prop({ required: true })
  deadline: Date;

  @Prop()
  txHash?: string;

  @Prop()
  paidAt?: Date;

  createdAt: Date;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ buyer: 1, createdAt: -1 });
OrderSchema.index({ sellerAddress: 1, status: 1, paidAt: -1 });
OrderSchema.index({ storeId: 1, status: 1, paidAt: -1 });
OrderSchema.index({ "lines.itemId": 1, status: 1, paidAt: -1 });
OrderSchema.index({ status: 1, deadline: 1 });

export interface OrderView {
  id: string;
  orderId: string;
  buyer: string;
  storeId: string;
  storeSlug: string;
  sellerAddress: string;
  lines: { itemId: string; tokenId: string; name: string; imageUrl: string; quantity: number; unitPriceWei: string }[];
  totalWei: string;
  feeWei: string | null;
  status: OrderStatus;
  deadline: Date;
  txHash: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export function toOrderView(order: OrderDocument): OrderView {
  return {
    id: order._id.toHexString(),
    orderId: order.orderId,
    buyer: order.buyer,
    storeId: order.storeId,
    storeSlug: order.storeSlug,
    sellerAddress: order.sellerAddress,
    lines: order.lines.map((line) => ({
      itemId: line.itemId,
      tokenId: line.tokenId,
      name: line.name,
      imageUrl: line.imageUrl,
      quantity: line.quantity,
      unitPriceWei: line.unitPriceWei.toString(),
    })),
    totalWei: order.totalWei.toString(),
    feeWei: order.feeWei?.toString() ?? null,
    status: order.status,
    deadline: order.deadline,
    txHash: order.txHash ?? null,
    paidAt: order.paidAt ?? null,
    createdAt: order.createdAt,
  };
}
