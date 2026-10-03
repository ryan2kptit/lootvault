import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

/** A single-use SIWE nonce. The TTL index purges expired rows; consumption also checks expiresAt. */
@Schema({ collection: "nonces", versionKey: false })
export class Nonce {
  @Prop({ type: String })
  _id: string;

  /** Lower-case address the nonce was issued for. */
  @Prop({ required: true })
  address: string;

  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt: Date;
}

export const NonceSchema = SchemaFactory.createForClass(Nonce);
