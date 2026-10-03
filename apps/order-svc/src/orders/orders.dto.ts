import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PageQueryDto } from "@lootvault/nest-common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsMongoId, IsOptional, Matches, Max, Min, ValidateNested } from "class-validator";

import { ORDER_STATUSES, type OrderStatus } from "../domain/order-state";

export class CartLineDto {
  @ApiProperty()
  @IsMongoId()
  itemId: string;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;
}

export class CheckoutDto {
  @ApiProperty({ type: [CartLineDto] })
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  lines: CartLineDto[];
}

export class ConfirmDto {
  @ApiProperty({ example: "0x..." })
  @Matches(/^0x[0-9a-fA-F]{64}$/, { message: "txHash must be a 32-byte hex string" })
  txHash: `0x${string}`;
}

export class SalesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;
}

export class RecentSalesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  itemId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}
