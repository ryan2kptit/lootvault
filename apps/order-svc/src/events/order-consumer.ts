import { SQSClient } from "@aws-sdk/client-sqs";
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { awsClientConfig, InjectConfig, SqsPoller } from "@lootvault/nest-common";

import type { OrderConfig } from "../config";
import { PurchasedHandler } from "./purchased.handler";

/** Local dev: polls order-q in-process. On AWS the same handler is driven by a Lambda SQS trigger. */
@Injectable()
export class OrderConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderConsumer.name);
  private poller?: SqsPoller;

  constructor(
    private readonly handler: PurchasedHandler,
    @InjectConfig() private readonly config: OrderConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.SQS_POLLING || !this.config.ORDER_QUEUE_URL) return;
    this.poller = new SqsPoller(
      new SQSClient(awsClientConfig(this.config)),
      this.config.ORDER_QUEUE_URL,
      (event) => this.handler.handle(event),
      this.logger,
    );
    this.poller.start();
    this.logger.log(`Polling ${this.config.ORDER_QUEUE_URL}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.poller?.stop();
  }
}
