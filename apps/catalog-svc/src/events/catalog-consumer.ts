import { SQSClient } from "@aws-sdk/client-sqs";
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { awsClientConfig, InjectConfig, SqsPoller } from "@lootvault/nest-common";

import type { CatalogConfig } from "../config";
import { CatalogEventsHandler } from "./catalog-events.handler";

/** Local dev: polls catalog-q in-process. On AWS the same handler is driven by a Lambda SQS trigger. */
@Injectable()
export class CatalogConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CatalogConsumer.name);
  private poller?: SqsPoller;

  constructor(
    private readonly handler: CatalogEventsHandler,
    @InjectConfig() private readonly config: CatalogConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.SQS_POLLING || !this.config.CATALOG_QUEUE_URL) return;
    this.poller = new SqsPoller(
      new SQSClient(awsClientConfig(this.config)),
      this.config.CATALOG_QUEUE_URL,
      (event) => this.handler.handle(event),
      this.logger,
    );
    this.poller.start();
    this.logger.log(`Polling ${this.config.CATALOG_QUEUE_URL}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.poller?.stop();
  }
}
