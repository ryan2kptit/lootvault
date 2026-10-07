import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, Types } from "mongoose";

export const ITEM_STATUSES = ["DRAFT", "LIVE", "HIDDEN"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;
export type ItemRarity = (typeof ITEM_RARITIES) [number];
@Schema({ collection: "items", versionKey: false, timestamps: true })
export class Item {
  @Prop({ type: Types.ObjectId, required: true })
  storeId: Types.ObjectId;

  @Prop({ required: true })
  ownerAddress: string;

  /** uint256 tokenId of this item, decimal string (derived from _id). */
  @Prop({ required: true, unique: true })
  tokenId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: "" })
  description: string;

  @Prop({ required: true })
  imageUrl: string;

  /** Edition size. Editable only before the first sale; after it, the chain (EditionLocked) is authoritative. */
  @Prop({ required: true, min: 1 })
  supply: number;

  /** Set by EditionLocked: the chain fixed the edition size. Keyed on the event, not on `sold`, because the two events can arrive in either order. */
  @Prop({ default: false })
  editionLocked: boolean;

  /** Projection of minted copies, updated from TransferSingle mint events. */
  @Prop({ default: 0, min: 0 })
  sold: number;

  @Prop({ type: Types.Decimal128, required: true })
  priceWei: Types.Decimal128;

  @Prop({ type: String, enum: ITEM_STATUSES, default: "DRAFT" })
  status: ItemStatus;

  @Prop({ type: String, enum: ITEM_RARITIES, default: "COMMON"})
  rarity: ItemRarity;

  createdAt: Date;
  updatedAt: Date;
}

export type ItemDocument = HydratedDocument<Item>;
export const ItemSchema = SchemaFactory.createForClass(Item);
ItemSchema.index({ name: "text", description: "text" });
ItemSchema.index({ storeId: 1, status: 1, createdAt: -1 });
ItemSchema.index({ storeId: 1, status: 1, priceWei: 1 });

export interface ItemView {
  id: string;
  storeId: string;
  ownerAddress: string;
  tokenId: string;
  name: string;
  description: string;
  imageUrl: string;
  supply: number;
  sold: number;
  remaining: number;
  /** Decimal string, wei. */
  priceWei: string;
  status: ItemStatus;
  rarity: ItemRarity;
  createdAt: Date;
  updatedAt: Date;
}

export function toItemView(item: ItemDocument): ItemView {
  return {
    id: item._id.toHexString(),
    storeId: item.storeId.toHexString(),
    ownerAddress: item.ownerAddress,
    tokenId: item.tokenId,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    supply: item.supply,
    sold: item.sold,
    remaining: Math.max(item.supply - item.sold, 0),
    priceWei: item.priceWei.toString(),
    status: item.status,
    rarity: item.rarity,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
