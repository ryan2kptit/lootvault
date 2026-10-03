import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { Provider } from "@nestjs/common";
import type { ChainEvent } from "@lootvault/shared";

import { APP_CONFIG } from "../config/env";
import { type AwsConfig, awsClientConfig } from "./aws";

export const EVENT_PUBLISHER = Symbol("EVENT_PUBLISHER");

export interface EventPublisher {
  /** Publishes in order; resolves once every event is accepted by the bus. */
  publish(events: ChainEvent[]): Promise<void>;
}

/** SNS fan-out; the `type` message attribute drives each queue's filter policy. */
export class SnsEventPublisher implements EventPublisher {
  constructor(
    private readonly sns: SNSClient,
    private readonly topicArn: string,
  ) {}

  async publish(events: ChainEvent[]): Promise<void> {
    for (const event of events) {
      await this.sns.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Message: JSON.stringify(event),
          MessageAttributes: { type: { DataType: "String", StringValue: event.type } },
        }),
      );
    }
  }
}

export const eventPublisherProvider: Provider = {
  provide: EVENT_PUBLISHER,
  inject: [APP_CONFIG],
  useFactory: (config: AwsConfig & { SNS_TOPIC_ARN: string }) =>
    new SnsEventPublisher(new SNSClient(awsClientConfig(config)), config.SNS_TOPIC_ARN),
};
