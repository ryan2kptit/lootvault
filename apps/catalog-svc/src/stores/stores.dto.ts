import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from "class-validator";

export class CreateStoreDto {
  @ApiProperty({ example: "pixel-legends", description: "3-32 chars: lower-case letters, digits, inner dashes" })
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, { message: "slug must be 3-32 chars of a-z, 0-9 and inner dashes" })
  slug: string;

  @ApiProperty({ example: "Pixel Legends" })
  @IsString()
  @Length(1, 60)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;
}
