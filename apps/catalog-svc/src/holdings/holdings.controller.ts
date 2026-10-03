import { Controller, Get, Param } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ApiTags } from "@nestjs/swagger";
import { AppError } from "@lootvault/nest-common";
import type { Model } from "mongoose";
import { isAddress } from "viem";

import { Item, toItemView } from "../items/item.schema";
import { Holding } from "./holding.schema";

@ApiTags("holdings")
@Controller("holdings")
export class HoldingsController {
  constructor(
    @InjectModel(Holding.name) private readonly holdings: Model<Holding>,
    @InjectModel(Item.name) private readonly items: Model<Item>,
  ) {}

  /** "My collection": tokens an address currently holds, with their item details. */
  @Get(":address")
  async forAddress(@Param("address") address: string) {
    if (!isAddress(address)) throw new AppError("VALIDATION_FAILED", 400, "address must be an Ethereum address");
    const holdings = await this.holdings.find({ address: address.toLowerCase(), balance: { $gt: 0 } }).lean();
    const items = new Map((await this.items.find({ _id: { $in: holdings.map((h) => h.itemId) } })).map((i) => [i._id.toHexString(), i]));
    return holdings
      .filter((h) => items.has(h.itemId))
      .map((h) => ({ tokenId: h.tokenId, balance: h.balance, item: toItemView(items.get(h.itemId)!) }));
  }
}
