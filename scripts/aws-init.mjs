#!/usr/bin/env node
// Idempotently creates the local AWS resources on the moto emulator (safe to re-run after any
// Docker restart, since moto keeps state in memory) and records their identifiers in .env.
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { CreateTopicCommand, ListSubscriptionsByTopicCommand, SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";
import { CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";

import { upsertEnv } from "./lib/env-file.mjs";
import { assertLocalAwsEndpoint } from "./lib/local-guard.mjs";
import { loadRootEnv, ROOT_ENV_URL } from "./lib/root-env.mjs";

const env = loadRootEnv();
assertLocalAwsEndpoint(env.AWS_ENDPOINT_URL); // creates buckets/topics/queues: never against real AWS
const aws = { region: env.AWS_REGION ?? "ap-southeast-1", endpoint: env.AWS_ENDPOINT_URL };
const s3 = new S3Client({ ...aws, forcePathStyle: true });
const sns = new SNSClient(aws);
const sqs = new SQSClient(aws);

const bucket = env.MEDIA_BUCKET ?? "lootvault-media";
const origins = (env.WEB_ORIGINS ?? "http://localhost:3000,http://localhost:3100").split(",");

// ---------------------------------------------------------------- S3
try {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
} catch {
  await s3.send(
    new CreateBucketCommand({
      Bucket: bucket,
      ...(aws.region === "us-east-1" ? {} : { CreateBucketConfiguration: { LocationConstraint: aws.region } }),
    }),
  );
}
await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["GET", "POST", "PUT"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"] }],
    },
  }),
);
await s3.send(
  new PutBucketPolicyCommand({
    Bucket: bucket,
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadMediaAndMetadata",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: [`arn:aws:s3:::${bucket}/media/*`, `arn:aws:s3:::${bucket}/metadata/*`],
        },
      ],
    }),
  }),
);
console.log(`✔ bucket ${bucket} (CORS: ${origins.join(", ")})`);

// ---------------------------------------------------------------- SNS -> SQS (+DLQ)
const { TopicArn: topicArn } = await sns.send(new CreateTopicCommand({ Name: env.SNS_TOPIC_NAME ?? "lootvault-chain-events" }));
console.log(`✔ topic ${topicArn}`);

const queueArn = async (url) =>
  (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["QueueArn"] }))).Attributes.QueueArn;

async function subscribedQueue(name, eventTypes) {
  const { QueueUrl: dlqUrl } = await sqs.send(new CreateQueueCommand({ QueueName: `${name}-dlq` }));
  const { QueueUrl: url } = await sqs.send(new CreateQueueCommand({ QueueName: name }));
  const arn = await queueArn(url);
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: url,
      Attributes: {
        VisibilityTimeout: "30",
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: await queueArn(dlqUrl), maxReceiveCount: "5" }),
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: arn,
              Condition: { ArnEquals: { "aws:SourceArn": topicArn } },
            },
          ],
        }),
      },
    }),
  );
  const { Subscriptions = [] } = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }));
  if (!Subscriptions.some((s) => s.Endpoint === arn)) {
    await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: arn,
        Attributes: { RawMessageDelivery: "true", FilterPolicy: JSON.stringify({ type: eventTypes }) },
      }),
    );
  }
  console.log(`✔ queue ${name} <- ${eventTypes.join(", ")} (DLQ ${name}-dlq after 5 receives)`);
  return url;
}

const catalogQueueUrl = await subscribedQueue(env.CATALOG_QUEUE_NAME ?? "lootvault-catalog-q", [
  "chain.TransferSingle",
  "chain.EditionLocked",
]);
const orderQueueUrl = await subscribedQueue(env.ORDER_QUEUE_NAME ?? "lootvault-order-q", ["chain.Purchased"]);

upsertEnv(ROOT_ENV_URL, { SNS_TOPIC_ARN: topicArn, CATALOG_QUEUE_URL: catalogQueueUrl, ORDER_QUEUE_URL: orderQueueUrl });
console.log(".env updated: SNS_TOPIC_ARN, CATALOG_QUEUE_URL, ORDER_QUEUE_URL");
