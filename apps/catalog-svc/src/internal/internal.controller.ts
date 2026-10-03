import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiProperty, ApiTags } from "@nestjs/swagger";
import { InternalKeyGuard } from "@lootvault/nest-common";
import { ArrayMaxSize, ArrayMinSize, IsMongoId } from "class-validator";

import { ItemsService } from "../items/items.service";

class BatchItemsDto {
  @ApiProperty({ type: [String] })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsMongoId({ each: true })
  ids: string[];
}

/** Service-to-service API (order-svc checkout). Not for browsers. */
@ApiTags("internal")
@ApiHeader({ name: "x-internal-key", required: true })
@UseGuards(InternalKeyGuard)
@Controller("internal")
export class InternalController {
  constructor(private readonly items: ItemsService) {}

  @Post("items/batch")
  @HttpCode(200)
  batch(@Body() body: BatchItemsDto) {
    return this.items.batch(body.ids);
  }
}
