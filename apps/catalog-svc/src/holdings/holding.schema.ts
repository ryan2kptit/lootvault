import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

/** Balance projection from ERC-1155 TransferSingle events. _id = `${address}:${tokenId}`. */
@Schema({ collection: "holdings", versionKey: false })
export class Holding {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, index: true })
  address: string;

  @Prop({ required: true })
  tokenId: string;

  @Prop({ required: true })
  itemId: string;

  @Prop({ default: 0 })
  balance: number;
}

export const HoldingSchema = SchemaFactory.createForClass(Holding);
export const holdingId = (address: string, tokenId: string) => `${address}:${tokenId}`;
