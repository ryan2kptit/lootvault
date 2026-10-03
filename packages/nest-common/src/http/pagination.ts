import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

/** Offset pagination over any data source: `find(skip, limit)` + `count()`. */
export async function paginate<T>(
  query: PageQueryDto,
  find: (skip: number, limit: number) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<Page<T>> {
  const [items, total] = await Promise.all([find((query.page - 1) * query.limit, query.limit), count()]);
  return { items, page: query.page, limit: query.limit, total };
}
