import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { LoggerService } from "@nestjs/common";
import type { ChainEvent } from "@lootvault/shared";

export type ChainEventHandler = (event: ChainEvent) => Promise<void>;

/**
 * Local-only SQS consumer (on AWS, Lambda's SQS event source does this job).
 * Long-polls, hands each message to `handle`, deletes it on success. A failing message is left
 * in the queue: SQS redelivers it after the visibility timeout and moves it to the DLQ after
 * maxReceiveCount attempts.
 */
export class SqsPoller {
  private running = false;
  private abort = new AbortController();
  private loop?: Promise<void>;

  constructor(
    private readonly sqs: SQSClient,
    private readonly queueUrl: string,
    private readonly handle: ChainEventHandler,
    private readonly logger: LoggerService,
    private readonly waitTimeSeconds = 10,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort.abort();
    await this.loop;
  }

  /** Receives and processes one batch; returns how many messages were handled successfully. */
  async pollOnce(): Promise<number> {
    const response = await this.sqs.send(
      new ReceiveMessageCommand({ QueueUrl: this.queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: this.waitTimeSeconds }),
      { abortSignal: this.abort.signal },
    );
    let handled = 0;
    for (const message of response.Messages ?? []) {
      try {
        await this.handle(JSON.parse(message.Body ?? "{}") as ChainEvent);
      } catch (error) {
        this.logger.error(`Message ${message.MessageId} failed; it will be retried: ${(error as Error).message}`, SqsPoller.name);
        continue;
      }
      handled += 1;
      try {
        await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle }));
      } catch (error) {
        this.logger.warn(
          `Message ${message.MessageId} handled but not deleted; the inbox will drop its redelivery: ${(error as Error).message}`,
          SqsPoller.name,
        );
      }
    }
    return handled;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        if (!this.running) break;
        this.logger.warn(`Polling ${this.queueUrl} failed: ${(error as Error).message}`, SqsPoller.name);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}
