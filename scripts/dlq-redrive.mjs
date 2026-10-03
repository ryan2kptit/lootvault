#!/usr/bin/env node
// Moves every message from the dead-letter queues back to their source queues (catalog-q, order-q).
// Use it after fixing whatever made a consumer fail 5 times. Bodies and message attributes are re-sent
// exactly as received (SNS-wrapped or raw): the consumers already parse whatever arrives.
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import { deadLetterQueueUrl } from "./lib/dlq.mjs";
import { assertLocalAwsEndpoint } from "./lib/local-guard.mjs";
import { loadRootEnv } from "./lib/root-env.mjs";

const env = loadRootEnv();
assertLocalAwsEndpoint(env.AWS_ENDPOINT_URL);
const sqs = new SQSClient({ region: env.AWS_REGION ?? "ap-southeast-1", endpoint: env.AWS_ENDPOINT_URL });

async function redrive(label, sourceUrl) {
  if (!sourceUrl) throw new Error(`${label}: queue URL is not set in .env; run \`npm run bootstrap\``);
  const dlqUrl = await deadLetterQueueUrl(sqs, sourceUrl);
  let moved = 0;
  for (;;) {
    const { Messages = [] } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: dlqUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 1, MessageAttributeNames: ["All"] }),
    );
    if (Messages.length === 0) break;
    for (const message of Messages) {
      // Send first, delete second: a crash in between duplicates the message (inboxes drop it) rather than losing it.
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: sourceUrl,
          MessageBody: message.Body,
          ...(message.MessageAttributes && Object.keys(message.MessageAttributes).length > 0
            ? { MessageAttributes: message.MessageAttributes }
            : {}),
        }),
      );
      await sqs.send(new DeleteMessageCommand({ QueueUrl: dlqUrl, ReceiptHandle: message.ReceiptHandle }));
      moved += 1;
    }
  }
  console.log(`✔ ${label}: moved ${moved} message(s) from ${dlqUrl.split("/").at(-1)} back to ${sourceUrl.split("/").at(-1)}`);
  return moved;
}

const total =
  (await redrive("catalog", env.CATALOG_QUEUE_URL)) + (await redrive("order", env.ORDER_QUEUE_URL));
console.log(total === 0 ? "Dead-letter queues were already empty." : `Redrove ${total} message(s). Watch the service logs: if they fail again they return to the DLQ.`);
