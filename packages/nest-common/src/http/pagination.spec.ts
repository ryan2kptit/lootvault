import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { PageQueryDto, paginate } from "./pagination";

const validate = (plain: Record<string, string>) => validateSync(plainToInstance(PageQueryDto, plain));

describe("PageQueryDto", () => {
  it("defaults to page 1 and limit 20", () => {
    const query = plainToInstance(PageQueryDto, {});
    expect(validateSync(query)).toEqual([]);
    expect(query).toMatchObject({ page: 1, limit: 20 });
  });

  it("caps page at 10000 and limit at 50", () => {
    expect(validate({ page: "10000", limit: "50" })).toEqual([]);
    expect(validate({ page: "10001" }).map((e) => e.property)).toEqual(["page"]);
    expect(validate({ limit: "51" }).map((e) => e.property)).toEqual(["limit"]);
  });

  it("rejects page 0", () => {
    expect(validate({ page: "0" }).map((e) => e.property)).toEqual(["page"]);
  });
});

describe("paginate", () => {
  it("passes the offset to find and returns the page envelope", async () => {
    const find = jest.fn().mockResolvedValue(["a", "b"]);
    const query = Object.assign(new PageQueryDto(), { page: 3, limit: 2 });
    await expect(paginate(query, find, async () => 7)).resolves.toEqual({ items: ["a", "b"], page: 3, limit: 2, total: 7 });
    expect(find).toHaveBeenCalledWith(4, 2);
  });
});
