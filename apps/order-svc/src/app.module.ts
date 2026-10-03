import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import {
  APP_CONFIG,
  AppConfigModule,
  CommonAuthModule,
  createLoggerModule,
  eventPublisherProvider,
  InboxModule,
} from "@lootvault/nest-common";
import { createPublicClient, http } from "viem";

import { CATALOG_CLIENT, HttpCatalogClient } from "./catalog/catalog.client";
import { CHAIN_READER, ViemChainReader } from "./chain/chain-reader";
import { type OrderConfig, orderConfigSchema } from "./config";
import { OrderConsumer } from "./events/order-consumer";
import { PurchasedHandler } from "./events/purchased.handler";
import { CheckoutSigner } from "./orders/checkout-signer";
import { Order, OrderSchema } from "./orders/order.schema";
import { OrderSweeper } from "./orders/order-sweeper";
import { OrdersController } from "./orders/orders.controller";
import { OrdersService } from "./orders/orders.service";

@Module({
  imports: [
    AppConfigModule.forRoot(orderConfigSchema),
    createLoggerModule("order-svc"),
    CommonAuthModule.forRoot(),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: OrderConfig) => ({ uri: config.MONGO_URL, dbName: config.ORDER_DB }),
    }),
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    InboxModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    CheckoutSigner,
    PurchasedHandler,
    OrderSweeper,
    OrderConsumer,
    eventPublisherProvider,
    {
      provide: CATALOG_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: OrderConfig) => new HttpCatalogClient(config.CATALOG_URL, config.INTERNAL_API_KEY),
    },
    {
      provide: CHAIN_READER,
      inject: [APP_CONFIG],
      useFactory: (config: OrderConfig) => new ViemChainReader(createPublicClient({ transport: http(config.RPC_URL) })),
    },
  ],
})
export class AppModule {}
