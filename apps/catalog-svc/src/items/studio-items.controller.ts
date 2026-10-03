import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type AuthUser, CurrentUser, JwtAuthGuard, PageQueryDto } from "@lootvault/nest-common";

import { CreateItemDto, UpdateItemDto } from "./items.dto";
import { ItemsService } from "./items.service";

/** Publisher-side item management (Studio). Every route acts on the caller's own store. */
@ApiTags("studio items")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StudioItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post("items")
  create(@CurrentUser() user: AuthUser, @Body() body: CreateItemDto) {
    return this.items.create(user.address, body);
  }

  @Patch("items/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: UpdateItemDto) {
    return this.items.update(user.address, id, body);
  }

  @Post("items/:id/publish")
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.items.publish(user.address, id);
  }

  @Post("items/:id/unpublish")
  @HttpCode(200)
  unpublish(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.items.unpublish(user.address, id);
  }

  @Get("me/items")
  mine(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto) {
    return this.items.listMine(user.address, query);
  }
}
