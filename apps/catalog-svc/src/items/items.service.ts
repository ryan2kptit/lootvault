import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { AppError, InjectConfig, type Page, type PageQueryDto, paginate } from "@lootvault/nest-common";
import { metadataKey, tokenIdFromItemId, tokenIdToString } from "@lootvault/shared";
import { type FilterQuery, isValidObjectId, type Model, type SortOrder, Types } from "mongoose";

import type { CatalogConfig } from "../config";
import { MEDIA_STORAGE, type MediaStorage } from "../media/media-storage";
import { StoresService } from "../stores/stores.service";
import { Item, type ItemDocument, type ItemView, toItemView } from "./item.schema";
import type { CreateItemDto, StorefrontQueryDto, StorefrontSort, UpdateItemDto } from "./items.dto";

const itemNotFound = () => new AppError("ITEM_NOT_FOUND", 404, "Item not found");

const SORTS: Record<StorefrontSort, Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { priceWei: 1, _id: 1 },
  price_desc: { priceWei: -1, _id: -1 },
};

export interface PublicItemView extends ItemView {
  store: { id: string; slug: string; name: string };
}

export interface InternalItemView {
  id: string;
  storeId: string;
  storeSlug: string;
  ownerAddress: string;
  tokenId: string;
  name: string;
  imageUrl: string;
  status: Item["status"];
  priceWei: string;
  supply: number;
  sold: number;
}

@Injectable()
export class ItemsService implements OnModuleInit {
  constructor(
    @InjectModel(Item.name) private readonly items: Model<Item>,
    private readonly stores: StoresService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @InjectConfig() private readonly config: CatalogConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.items.init(); // text + unique indexes before the first query
  }

  async create(owner: string, dto: CreateItemDto): Promise<ItemView> {
    this.assertHostedImage(dto.imageUrl);
    const store = await this.stores.byOwner(owner);
    const _id = new Types.ObjectId();
    const item = await this.items.create({
      _id,
      storeId: store._id,
      ownerAddress: owner,
      tokenId: tokenIdToString(tokenIdFromItemId(_id.toHexString())),
      name: dto.name,
      description: dto.description ?? "",
      imageUrl: dto.imageUrl,
      supply: dto.supply,
      priceWei: Types.Decimal128.fromString(dto.priceWei),
    });
    return toItemView(item);
  }

  async update(owner: string, id: string, dto: UpdateItemDto): Promise<ItemView> {
    const item = await this.owned(owner, id);
    if (dto.imageUrl !== undefined) this.assertHostedImage(dto.imageUrl);
    if (dto.supply !== undefined && dto.supply !== item.supply && (item.sold > 0 || item.editionLocked)) {
      throw new AppError("SUPPLY_LOCKED", 409, "Edition size is fixed on-chain after the first sale");
    }
    const metadataChanged = ["name", "description", "imageUrl"].some(
      (field) => dto[field as keyof UpdateItemDto] !== undefined && dto[field as keyof UpdateItemDto] !== item.get(field),
    );
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.description !== undefined) item.description = dto.description;
    if (dto.imageUrl !== undefined) item.imageUrl = dto.imageUrl;
    if (dto.supply !== undefined) item.supply = dto.supply;
    if (dto.priceWei !== undefined) item.priceWei = Types.Decimal128.fromString(dto.priceWei);
    // Metadata first, like publish(): if the S3 put fails nothing is persisted, so a retry still sees the change.
    if (item.status === "LIVE" && metadataChanged) await this.writeMetadata(item);
    await item.save();
    return toItemView(item);
  }

  async publish(owner: string, id: string): Promise<ItemView> {
    const item = await this.owned(owner, id);
    if (item.status !== "LIVE") {
      await this.writeMetadata(item);
      item.status = "LIVE";
      await item.save();
    }
    return toItemView(item);
  }

  async unpublish(owner: string, id: string): Promise<ItemView> {
    const item = await this.owned(owner, id);
    if (item.status === "LIVE") {
      item.status = "HIDDEN";
      await item.save();
    }
    return toItemView(item);
  }

  async listMine(owner: string, query: PageQueryDto): Promise<Page<ItemView>> {
    const store = await this.stores.byOwner(owner);
    const filter = { storeId: store._id };
    return paginate(
      query,
      async (skip, limit) => (await this.items.find(filter).sort(SORTS.newest).skip(skip).limit(limit)).map(toItemView),
      () => this.items.countDocuments(filter),
    );
  }

  async listStorefront(slug: string, query: StorefrontQueryDto): Promise<Page<ItemView>> {
    const store = await this.stores.bySlug(slug);
    const filter: FilterQuery<Item> = { storeId: store._id, status: "LIVE" };
    if (query.q) filter.$text = { $search: query.q };
    if (query.minPrice || query.maxPrice) {
      filter.priceWei = {
        ...(query.minPrice ? { $gte: Types.Decimal128.fromString(query.minPrice) } : {}),
        ...(query.maxPrice ? { $lte: Types.Decimal128.fromString(query.maxPrice) } : {}),
      };
    }
    if (query.inStock) filter.$expr = { $lt: ["$sold", "$supply"] };
    return paginate(
      query,
      async (skip, limit) => (await this.items.find(filter).sort(SORTS[query.sort]).skip(skip).limit(limit)).map(toItemView),
      () => this.items.countDocuments(filter),
    );
  }

  /** LIVE items are public; drafts and hidden items are visible to their owner only. */
  async getPublic(id: string, viewer?: string): Promise<PublicItemView> {
    const item = isValidObjectId(id) ? await this.items.findById(id) : null;
    if (!item || (item.status !== "LIVE" && item.ownerAddress !== viewer)) throw itemNotFound();
    const [store] = await this.stores.byIds([item.storeId.toHexString()]);
    return { ...toItemView(item), store: { id: store._id.toHexString(), slug: store.slug, name: store.name } };
  }

  /** Fresh price/status/stock for order-svc's checkout. Unknown ids are omitted. */
  async batch(ids: string[]): Promise<InternalItemView[]> {
    const items = await this.items.find({ _id: { $in: ids.filter((id) => isValidObjectId(id)) } });
    const stores = new Map(
      (await this.stores.byIds([...new Set(items.map((i) => i.storeId.toHexString()))])).map((s) => [s._id.toHexString(), s.slug]),
    );
    return items.map((item) => ({
      id: item._id.toHexString(),
      storeId: item.storeId.toHexString(),
      storeSlug: stores.get(item.storeId.toHexString()) ?? "",
      ownerAddress: item.ownerAddress,
      tokenId: item.tokenId,
      name: item.name,
      imageUrl: item.imageUrl,
      status: item.status,
      priceWei: item.priceWei.toString(),
      supply: item.supply,
      sold: item.sold,
    }));
  }

  /** Published metadata may only reference media uploaded through our presigned POST. */
  private assertHostedImage(imageUrl: string): void {
    const prefix = `${this.config.MEDIA_PUBLIC_URL.replace(/\/+$/, "")}/media/`;
    if (!imageUrl.startsWith(prefix)) {
      throw new AppError("IMAGE_NOT_HOSTED", 400, `imageUrl must be an image uploaded via /catalog/uploads/presign (starting with ${prefix})`);
    }
  }

  private async owned(owner: string, id: string): Promise<ItemDocument> {
    const item = isValidObjectId(id) ? await this.items.findById(id) : null;
    if (!item) throw itemNotFound();
    if (item.ownerAddress !== owner) throw new AppError("FORBIDDEN", 403, "This item belongs to another store");
    return item;
  }

  /** ERC-1155 metadata at metadata/<tokenIdHex64>.json, matching the contract's `{id}` URI template. */
  private async writeMetadata(item: ItemDocument): Promise<void> {
    const [store] = await this.stores.byIds([item.storeId.toHexString()]);
    await this.media.putJson(metadataKey(BigInt(item.tokenId)), {
      name: item.name,
      description: item.description,
      image: item.imageUrl,
      external_url: `${this.config.STOREFRONT_URL}/s/${store.slug}/items/${item._id.toHexString()}`,
      attributes: [{ trait_type: "Store", value: store.name }],
    });
  }
}
