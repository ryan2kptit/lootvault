import { GetQueueAttributesCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";

/** The DLQ of `queueUrl`, found through the source queue's RedrivePolicy (deadLetterTargetArn -> queue name). */
export async function deadLetterQueueUrl(sqs, queueUrl) {
  const { Attributes } = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ["RedrivePolicy"] }));
  const arn = Attributes?.RedrivePolicy ? JSON.parse(Attributes.RedrivePolicy).deadLetterTargetArn : undefined;
  if (!arn) throw new Error(`${queueUrl} has no RedrivePolicy; run \`npm run bootstrap\``);
  return (await sqs.send(new GetQueueUrlCommand({ QueueName: arn.split(":").at(-1) }))).QueueUrl;
}
