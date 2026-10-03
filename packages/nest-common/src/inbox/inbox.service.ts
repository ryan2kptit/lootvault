import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Connection, Model } from "mongoose";

import { ProcessedEvent } from "./processed-event.schema";

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

export type InboxResult = "processed" | "duplicate";

/**
 * Inbox pattern: the event id is recorded in the SAME Mongo transaction as the state change,
 * so a redelivered event (SQS retry, or fast-path + indexer publishing the same log) is applied once.
 */
@Injectable()
export class InboxService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(ProcessedEvent.name) private readonly processed: Model<ProcessedEvent>,
  ) {}

  async runOnce(event: { id: string; type: string }, apply: (session: ClientSession) => Promise<void>): Promise<InboxResult> {
    try {
      await this.connection.transaction(async (session) => {
        await this.processed.create([{ _id: event.id, type: event.type }], { session });
        await apply(session);
      });
      return "processed";
    } catch (error) {
      if (isDuplicateKey(error)) return "duplicate";
      throw error;
    }
  }
}
