import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

@Schema({ collection: "stores", versionKey: false, timestamps: { createdAt: true, updatedAt: false } })
export class Store {
  @Prop({ required: true, unique: true })
  slug: string;

  /** One store per wallet (lower-case). */
  @Prop({ required: true, unique: true })
  ownerAddress: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: "" })
  description: string;

  @Prop()
  logoUrl?: string;

  createdAt: Date;
}

export type StoreDocument = HydratedDocument<Store>;
export const StoreSchema = SchemaFactory.createForClass(Store);

export interface StoreView {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  ownerAddress: string;
  createdAt: Date;
}

export function toStoreView(store: StoreDocument): StoreView {
  return {
    id: store._id.toHexString(),
    slug: store.slug,
    name: store.name,
    description: store.description,
    logoUrl: store.logoUrl ?? null,
    ownerAddress: store.ownerAddress,
    createdAt: store.createdAt,
  };
}
