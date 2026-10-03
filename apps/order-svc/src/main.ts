import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { APP_CONFIG, configureApp } from "@lootvault/nest-common";

import { AppModule } from "./app.module";
import type { OrderConfig } from "./config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, { prefix: "orders", title: "LootVault order-svc" });
  await app.listen(app.get<OrderConfig>(APP_CONFIG).ORDER_PORT);
}

void bootstrap();
