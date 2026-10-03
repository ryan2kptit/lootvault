import { S3Client } from "@aws-sdk/client-s3";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  APP_CONFIG,
  AppConfigModule,
  awsClientConfig,
  CommonAuthModule,
  createLoggerModule,
  InboxModule,
} from "@lootvault/nest-common";

import { type CatalogConfig, catalogConfigSchema } from "./config";
import { CatalogConsumer } from "./events/catalog-consumer";
import { CatalogEventsHandler } from "./events/catalog-events.handler";
import { HealthController } from "./health.controller";
import { HoldingsController } from "./holdings/holdings.controller";
import { Holding, HoldingSchema } from "./holdings/holding.schema";
import { InternalController } from "./internal/internal.controller";
import { Item, ItemSchema } from "./items/item.schema";
import { ItemsService } from "./items/items.service";
import { StorefrontController } from "./items/storefront.controller";
import { StudioItemsController } from "./items/studio-items.controller";
import { MEDIA_STORAGE, S3MediaStorage } from "./media/media-storage";
import { UploadsController } from "./media/uploads.controller";
import { Store, StoreSchema } from "./stores/store.schema";
import { StoresController } from "./stores/stores.controller";
import { StoresService } from "./stores/stores.service";

@Module({
  imports: [
    AppConfigModule.forRoot(catalogConfigSchema),
    createLoggerModule("catalog-svc"),
    CommonAuthModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: CatalogConfig) => ({ uri: config.MONGO_URL, dbName: config.CATALOG_DB }),
    }),
    MongooseModule.forFeature([
      { name: Store.name, schema: StoreSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Holding.name, schema: HoldingSchema },
    ]),
    InboxModule,
  ],
  controllers: [
    HealthController,
    StoresController,
    StudioItemsController,
    StorefrontController,
    HoldingsController,
    UploadsController,
    InternalController,
  ],
  providers: [
    StoresService,
    ItemsService,
    CatalogEventsHandler,
    CatalogConsumer,
    {
      provide: MEDIA_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: CatalogConfig) =>
        new S3MediaStorage(
          new S3Client({ ...awsClientConfig(config), forcePathStyle: Boolean(config.AWS_ENDPOINT_URL) }),
          config.MEDIA_BUCKET,
          config.MEDIA_PUBLIC_URL,
        ),
    },
  ],
})
export class AppModule {}
