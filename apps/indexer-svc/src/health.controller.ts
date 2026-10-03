import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { IndexerService } from "./indexer.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly indexer: IndexerService) {}

  @Get()
  async health() {
    return { status: "ok", lastBlock: await this.indexer.lastBlock() };
  }
}
