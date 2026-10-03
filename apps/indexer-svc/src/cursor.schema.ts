import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

/** Last fully published block per `${chainId}:${contract}`. */
@Schema({ collection: "cursors", versionKey: false })
export class Cursor {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true })
  lastBlock: number;
}

export const CursorSchema = SchemaFactory.createForClass(Cursor);
