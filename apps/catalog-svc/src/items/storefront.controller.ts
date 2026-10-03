import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type AuthUser, CurrentUser, OptionalJwtAuthGuard } from "@lootvault/nest-common";

import { StorefrontQueryDto } from "./items.dto";
import { ItemsService } from "./items.service";

@ApiTags("storefront")
@Controller()
export class StorefrontController {
  constructor(private readonly items: ItemsService) {}

  @Get("stores/:slug/items")
  list(@Param("slug") slug: string, @Query() query: StorefrontQueryDto) {
    return this.items.listStorefront(slug, query);
  }

  @Get("items/:id")
  @UseGuards(OptionalJwtAuthGuard)
  get(@Param("id") id: string, @CurrentUser() user?: AuthUser) {
    return this.items.getPublic(id, user?.address);
  }
}
