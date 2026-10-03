import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { APP_CONFIG, configureApp } from "@lootvault/nest-common";

import { AppModule } from "./app.module";
import type { CatalogConfig } from "./config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, { prefix: "catalog", title: "LootVault catalog-svc" });
  await app.listen(app.get<CatalogConfig>(APP_CONFIG).CATALOG_PORT);
}

void bootstrap();
