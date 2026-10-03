import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

/** One row per consumed event id: the inbox that makes at-least-once delivery effectively-once. */
@Schema({ collection: "processed_events", versionKey: false })
export class ProcessedEvent {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true })
  type: string;

  @Prop({ default: () => new Date() })
  processedAt: Date;
}

export const ProcessedEventSchema = SchemaFactory.createForClass(ProcessedEvent);
