import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Connection, Model } from "mongoose";

import { ProcessedEvent } from "./processed-event.schema";

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

export type InboxResult = "processed" | "duplicate";

/** Raised only when the inbox insert itself collides, so a handler's own E11000 is never mistaken for a duplicate event. */
class DuplicateEventError extends Error {}

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

  /**
   * Applies `apply` at most once per `event.id`. `apply` may be re-run on transient transaction errors
   * (e.g. a concurrent WriteConflict), so it must only write through the given session and have no
   * external side effects. Only a collision on the inbox row means "duplicate"; any error thrown by
   * `apply`, including its own duplicate-key error, rolls back the inbox row and is rethrown.
   */
  async runOnce(event: { id: string; type: string }, apply: (session: ClientSession) => Promise<void>): Promise<InboxResult> {
    try {
      await this.connection.transaction(async (session) => {
        try {
          await this.processed.create([{ _id: event.id, type: event.type }], { session });
        } catch (error) {
          if (isDuplicateKey(error)) throw new DuplicateEventError(event.id);
          throw error;
        }
        await apply(session);
      });
      return "processed";
    } catch (error) {
      if (error instanceof DuplicateEventError) return "duplicate";
      throw error;
    }
  }
}
