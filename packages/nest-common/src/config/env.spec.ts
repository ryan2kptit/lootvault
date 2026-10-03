import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { loadEnvFile, parseConfig } from "./env";

describe("parseConfig", () => {
  const schema = z.object({ PORT: z.coerce.number().int(), JWT_SECRET: z.string().min(8) });

  it("coerces and returns typed values", () => {
    expect(parseConfig(schema, { PORT: "3001", JWT_SECRET: "long-enough" })).toEqual({ PORT: 3001, JWT_SECRET: "long-enough" });
  });

  it("lists every invalid key in one error", () => {
    expect(() => parseConfig(schema, { PORT: "abc" })).toThrow(/PORT[\s\S]*JWT_SECRET/);
  });
});

describe("loadEnvFile", () => {
  it("finds the .env of an ancestor directory without overriding existing variables", () => {
    const root = mkdtempSync(join(tmpdir(), "lv-env-"));
    const service = join(root, "apps", "svc");
    mkdirSync(service, { recursive: true });
    writeFileSync(join(root, ".env"), "LV_TEST_FROM_FILE=file\nLV_TEST_KEEP=file\n");
    process.env.LV_TEST_KEEP = "process";

    expect(loadEnvFile(service)).toBe(join(root, ".env"));
    expect(process.env.LV_TEST_FROM_FILE).toBe("file");
    expect(process.env.LV_TEST_KEEP).toBe("process");
  });
});
