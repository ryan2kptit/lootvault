import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { InboxService } from "./inbox.service";
import { ProcessedEvent, ProcessedEventSchema } from "./processed-event.schema";

/** Requires a root MongooseModule connection to a replica set (transactions). */
@Module({
  imports: [MongooseModule.forFeature([{ name: ProcessedEvent.name, schema: ProcessedEventSchema }])],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
