import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ collection: "users", versionKey: false, timestamps: { createdAt: true, updatedAt: false } })
export class User {
  /** Lower-case wallet address. */
  @Prop({ type: String })
  _id: string;

  @Prop()
  lastLoginAt: Date;

  createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
