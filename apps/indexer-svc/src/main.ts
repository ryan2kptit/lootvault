import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { APP_CONFIG, configureApp } from "@lootvault/nest-common";

import { AppModule } from "./app.module";
import type { IndexerConfig } from "./config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, { prefix: "indexer", title: "LootVault indexer-svc" });
  await app.listen(app.get<IndexerConfig>(APP_CONFIG).INDEXER_PORT);
}

void bootstrap();
