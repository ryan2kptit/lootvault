import type { INestApplication, Type } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { configureApp } from "../http/configure-app";

/** In-memory single-node replica set (transactions work) for integration tests. */
export async function startMongo(): Promise<{ uri: string; stop: () => Promise<void> }> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  return { uri: replSet.getUri(), stop: async () => void (await replSet.stop()) };
}

export interface TestAppOptions {
  prefix: string;
  /** Environment for the service config; applied before the module is compiled. */
  env: Record<string, string>;
  /** Replace providers (e.g. external clients) before compiling. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Boots a service module exactly like main.ts does (prefix, pipes, error filter), but in-process. */
export async function createTestApp(appModule: Type<unknown>, options: TestAppOptions): Promise<INestApplication> {
  Object.assign(process.env, { LOG_LEVEL: "silent", LOG_PRETTY: "false", ...options.env });
  let builder = Test.createTestingModule({ imports: [appModule] });
  if (options.override) builder = options.override(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, { prefix: options.prefix, title: "test" });
  await app.init();
  return app;
}
