import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { PageQueryDto } from "@lootvault/nest-common";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min } from "class-validator";

const WEI = /^[1-9]\d{0,29}$/;
const WEI_MESSAGE = "must be a positive integer amount of wei, as a decimal string";

export class CreateItemDto {
  @ApiProperty({ example: "Ember Drake" })
  @IsString()
  @Length(1, 80)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: "publicUrl returned by POST /catalog/uploads/presign" })
  @IsUrl({ require_tld: false })
  imageUrl: string;

  @ApiProperty({ minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  supply: number;

  @ApiProperty({ example: "10000000000000000", description: "Price per copy in wei" })
  @Matches(WEI, { message: `priceWei ${WEI_MESSAGE}` })
  priceWei: string;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}

export const STOREFRONT_SORTS = ["newest", "price_asc", "price_desc"] as const;
export type StorefrontSort = (typeof STOREFRONT_SORTS)[number];

export class StorefrontQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: "Full-text search over name and description" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: "Minimum price in wei" })
  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: `minPrice ${WEI_MESSAGE}` })
  minPrice?: string;

  @ApiPropertyOptional({ description: "Maximum price in wei" })
  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: `maxPrice ${WEI_MESSAGE}` })
  maxPrice?: string;

  @ApiPropertyOptional({ description: "Only items with copies left" })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ enum: STOREFRONT_SORTS, default: "newest" })
  @IsOptional()
  @IsIn(STOREFRONT_SORTS)
  sort: StorefrontSort = "newest";
}
