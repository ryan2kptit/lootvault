import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { createLoggerModule } from "./logger.module";

@Controller()
class PingController {
  @Get("ping")
  ping() {
    return "pong";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("createLoggerModule", () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, { LOG_LEVEL: "silent", LOG_PRETTY: "false" });
    const moduleRef = await Test.createTestingModule({ imports: [createLoggerModule("test")], controllers: [PingController] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  const requestIdFor = async (header?: string): Promise<string> => {
    const call = request(app.getHttpServer()).get("/ping");
    const response = await (header === undefined ? call : call.set("x-request-id", header)).expect(200);
    return response.headers["x-request-id"] as string;
  };

  it("generates a request id when none is sent", async () => {
    expect(await requestIdFor()).toMatch(UUID);
  });

  it("echoes a well-formed incoming request id", async () => {
    expect(await requestIdFor("trace:abc-123.X_y")).toBe("trace:abc-123.X_y");
  });

  it.each([
    ["empty", ""],
    ["too long", "a".repeat(129)],
    ["with spaces", "bad id"],
    ["with odd characters", "id<script>"],
  ])("replaces a %s incoming request id with a generated one", async (_label, header) => {
    expect(await requestIdFor(header)).toMatch(UUID);
  });

  it("loads the nearest .env before reading LOG_LEVEL / LOG_PRETTY", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lv-logger-env-"));
    writeFileSync(join(dir, ".env"), "LV_LOGGER_ENV_PROBE=loaded\n");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const moduleRef = await Test.createTestingModule({ imports: [createLoggerModule("test")] }).compile();
      await moduleRef.close();
    } finally {
      process.chdir(cwd);
    }
    expect(process.env.LV_LOGGER_ENV_PROBE).toBe("loaded");
  });
});
