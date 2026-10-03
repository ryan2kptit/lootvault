import { Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { AppError, type Page, type PageQueryDto, paginate } from "@lootvault/nest-common";
import type { Model } from "mongoose";

import { Store, type StoreDocument, type StoreView, toStoreView } from "./store.schema";
import type { CreateStoreDto } from "./stores.dto";

const storeNotFound = () => new AppError("STORE_NOT_FOUND", 404, "Store not found");

@Injectable()
export class StoresService implements OnModuleInit {
  constructor(@InjectModel(Store.name) private readonly stores: Model<Store>) {}

  async onModuleInit(): Promise<void> {
    await this.stores.init(); // unique indexes must exist before the first insert
  }

  async create(owner: string, dto: CreateStoreDto): Promise<StoreView> {
    if (await this.stores.exists({ ownerAddress: owner })) {
      throw new AppError("STORE_EXISTS", 409, "This wallet already owns a store");
    }
    try {
      const store = await this.stores.create({ ...dto, ownerAddress: owner });
      return toStoreView(store);
    } catch (error) {
      const keyPattern = (error as { code?: number; keyPattern?: Record<string, unknown> }).keyPattern;
      if ((error as { code?: number }).code === 11000) {
        throw keyPattern?.ownerAddress
          ? new AppError("STORE_EXISTS", 409, "This wallet already owns a store")
          : new AppError("SLUG_TAKEN", 409, `Slug "${dto.slug}" is taken`);
      }
      throw error;
    }
  }

  list(query: PageQueryDto): Promise<Page<StoreView>> {
    return paginate(
      query,
      async (skip, limit) => (await this.stores.find().sort({ createdAt: -1 }).skip(skip).limit(limit)).map(toStoreView),
      () => this.stores.countDocuments(),
    );
  }

  async bySlug(slug: string): Promise<StoreDocument> {
    const store = await this.stores.findOne({ slug });
    if (!store) throw storeNotFound();
    return store;
  }

  async byOwner(owner: string): Promise<StoreDocument> {
    const store = await this.stores.findOne({ ownerAddress: owner });
    if (!store) throw storeNotFound();
    return store;
  }

  async byIds(ids: string[]): Promise<StoreDocument[]> {
    return this.stores.find({ _id: { $in: ids } });
  }
}
