import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

/** One row per consumed event id: the inbox that makes at-least-once delivery effectively-once. */
@Schema({ collection: "processed_events", versionKey: false })
export class ProcessedEvent {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true })
  type: string;

  /** TTL index: rows expire after 30 days, longer than SQS's 14-day max retention, so a redelivery can never outlive its inbox row. */
  @Prop({ default: () => new Date(), expires: 60 * 60 * 24 * 30 })
  processedAt: Date;
}

export const ProcessedEventSchema = SchemaFactory.createForClass(ProcessedEvent);
