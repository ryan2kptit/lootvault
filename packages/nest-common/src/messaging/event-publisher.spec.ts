import { PublishCommand, type SNSClient } from "@aws-sdk/client-sns";
import type { ChainEvent } from "@lootvault/shared";

import { SnsEventPublisher } from "./event-publisher";

const TOPIC_ARN = "arn:aws:sns:us-east-1:000000000000:lootvault-chain-events";

const purchased = {
  id: "31337:0xaaa:0",
  type: "chain.Purchased",
  chainId: 31337,
  blockNumber: 10,
  blockTimestamp: 1_700_000_000,
  txHash: "0xaaa",
  logIndex: 0,
  data: { orderId: "0x01", buyer: "0xbuyer", total: "1000", fee: "25" },
} as unknown as ChainEvent;

const transfer = {
  id: "31337:0xaaa:1",
  type: "chain.TransferSingle",
  chainId: 31337,
  blockNumber: 10,
  blockTimestamp: 1_700_000_000,
  txHash: "0xaaa",
  logIndex: 1,
  data: { operator: "0xop", from: "0xfrom", to: "0xto", id: "7", value: "1" },
} as unknown as ChainEvent;

type Send = jest.Mock<Promise<unknown>, [PublishCommand]>;
const inputs = (send: Send) => send.mock.calls.map(([command]) => command.input);

describe("SnsEventPublisher", () => {
  it("publishes each event in order with the type message attribute", async () => {
    const send = jest.fn<Promise<unknown>, [PublishCommand]>(async () => ({}));
    const publisher = new SnsEventPublisher({ send } as unknown as SNSClient, TOPIC_ARN);

    await publisher.publish([purchased, transfer]);

    expect(send.mock.calls.every(([command]) => command instanceof PublishCommand)).toBe(true);
    expect(inputs(send)).toEqual([purchased, transfer].map((event) => ({
      TopicArn: TOPIC_ARN,
      Message: JSON.stringify(event),
      MessageAttributes: { type: { DataType: "String", StringValue: event.type } },
    })));
  });

  it("stops at the first failing publish and does not send the remaining events", async () => {
    const send = jest.fn<Promise<unknown>, [PublishCommand]>(async () => {
      throw new Error("sns down");
    });
    const publisher = new SnsEventPublisher({ send } as unknown as SNSClient, TOPIC_ARN);

    await expect(publisher.publish([purchased, transfer])).rejects.toThrow("sns down");

    expect(send).toHaveBeenCalledTimes(1);
    expect(inputs(send)[0].Message).toBe(JSON.stringify(purchased));
  });
});
