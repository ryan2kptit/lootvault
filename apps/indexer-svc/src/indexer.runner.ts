import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { InjectConfig } from "@lootvault/nest-common";

import type { IndexerConfig } from "./config";
import { IndexerService } from "./indexer.service";

/** Local polling loop: catches up as fast as possible, then sleeps POLL_INTERVAL_MS between ticks. */
@Injectable()
export class IndexerRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IndexerRunner.name);
  private running = false;
  private loop?: Promise<void>;

  constructor(
    private readonly indexer: IndexerService,
    @InjectConfig() private readonly config: IndexerConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.INDEXER_LOOP) return;
    this.running = true;
    this.loop = this.run();
    this.logger.log(`Indexing ${this.config.CONTRACT_ADDRESS} on chain ${this.config.CHAIN_ID} from block ${this.config.START_BLOCK}`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.indexer.tick();
        if (result?.published) this.logger.log(`Blocks ${result.fromBlock}-${result.toBlock}: published ${result.published} event(s)`);
        if (!result) await this.sleep();
      } catch (error) {
        this.logger.warn(`Tick failed, retrying: ${(error as Error).message}`);
        await this.sleep();
      }
    }
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.config.POLL_INTERVAL_MS));
  }
}
