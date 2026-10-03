import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { LoggerService } from "@nestjs/common";
import type { ChainEvent } from "@lootvault/shared";

import { SqsPoller } from "./sqs-poller";

const logger: LoggerService = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

function fakeSqs(bodies: unknown[]) {
  const sent: unknown[] = [];
  const client = {
    send: jest.fn(async (command: unknown) => {
      sent.push(command);
      if (command instanceof ReceiveMessageCommand) {
        return { Messages: bodies.map((body, i) => ({ MessageId: `m${i}`, ReceiptHandle: `r${i}`, Body: JSON.stringify(body) })) };
      }
      return {};
    }),
  } as unknown as SQSClient;
  return { client, sent };
}

describe("SqsPoller.pollOnce", () => {
  it("deletes handled messages and leaves failed ones for redelivery", async () => {
    const { client, sent } = fakeSqs([{ id: "ok" }, { id: "bad" }]);
    const handle = jest.fn(async (event: ChainEvent) => {
      if (event.id === "bad") throw new Error("handler failed");
    });

    const handled = await new SqsPoller(client, "queue-url", handle, logger, 0).pollOnce();

    expect(handled).toBe(1);
    expect(handle).toHaveBeenCalledTimes(2);
    const deletes = sent.filter((c) => c instanceof DeleteMessageCommand) as DeleteMessageCommand[];
    expect(deletes.map((d) => d.input.ReceiptHandle)).toEqual(["r0"]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("m1"), "SqsPoller");
  });
});
