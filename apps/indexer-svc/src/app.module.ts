import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_CONFIG, AppConfigModule, createLoggerModule, eventPublisherProvider } from "@lootvault/nest-common";
import { createPublicClient, http } from "viem";

import { CHAIN_SOURCE, ViemChainSource } from "./chain-source";
import { type IndexerConfig, indexerConfigSchema } from "./config";
import { Cursor, CursorSchema } from "./cursor.schema";
import { HealthController } from "./health.controller";
import { IndexerRunner } from "./indexer.runner";
import { IndexerService } from "./indexer.service";

@Module({
  imports: [
    AppConfigModule.forRoot(indexerConfigSchema),
    createLoggerModule("indexer-svc"),
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: IndexerConfig) => ({ uri: config.MONGO_URL, dbName: config.INDEXER_DB }),
    }),
    MongooseModule.forFeature([{ name: Cursor.name, schema: CursorSchema }]),
  ],
  controllers: [HealthController],
  providers: [
    IndexerService,
    IndexerRunner,
    eventPublisherProvider,
    {
      provide: CHAIN_SOURCE,
      inject: [APP_CONFIG],
      useFactory: (config: IndexerConfig) =>
        new ViemChainSource(createPublicClient({ transport: http(config.RPC_URL) }), config.CONTRACT_ADDRESS),
    },
  ],
})
export class AppModule {}
