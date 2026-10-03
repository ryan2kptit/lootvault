import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { APP_CONFIG, configureApp } from "@lootvault/nest-common";

import { AppModule } from "./app.module";
import type { AuthSvcConfig } from "./config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, { prefix: "auth", title: "LootVault auth-svc" });
  await app.listen(app.get<AuthSvcConfig>(APP_CONFIG).AUTH_PORT);
}

void bootstrap();
