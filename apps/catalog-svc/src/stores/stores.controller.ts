import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type AuthUser, CurrentUser, JwtAuthGuard, PageQueryDto } from "@lootvault/nest-common";

import { toStoreView } from "./store.schema";
import { CreateStoreDto } from "./stores.dto";
import { StoresService } from "./stores.service";

@ApiTags("stores")
@Controller("stores")
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateStoreDto) {
    return this.stores.create(user.address, body);
  }

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.stores.list(query);
  }

  // Declared before ":slug" so "me" is not treated as a slug.
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async mine(@CurrentUser() user: AuthUser) {
    return toStoreView(await this.stores.byOwner(user.address));
  }

  @Get(":slug")
  async bySlug(@Param("slug") slug: string) {
    return toStoreView(await this.stores.bySlug(slug));
  }
}
