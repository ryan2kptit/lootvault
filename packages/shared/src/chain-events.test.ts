import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, encodeEventTopics, getAbiItem, type Address, type Hex, type Log } from "viem";

import { lootVault1155Abi } from "./abi/lootVault1155";
import { toChainEvents } from "./chain-events";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const CREATOR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const TX = "0xAAAA000000000000000000000000000000000000000000000000000000000001" as Hex;
const ORDER = "0xBBBB000000000000000000000000000000000000000000000000000000000002" as Hex;

type EventName = "Purchased" | "TransferSingle" | "EditionLocked" | "ApprovalForAll";

function makeLog(eventName: EventName, args: Record<string, unknown>, at: { block: bigint; index: number; address?: Address }): Log {
  const item = getAbiItem({ abi: lootVault1155Abi, name: eventName }) as { inputs: readonly { name: string; type: string; indexed?: boolean }[] };
  const nonIndexed = item.inputs.filter((input) => !input.indexed);
  return {
    address: at.address ?? CONTRACT,
    topics: encodeEventTopics({ abi: lootVault1155Abi, eventName, args } as never) as Log["topics"],
    data: encodeAbiParameters(nonIndexed, nonIndexed.map((input) => args[input.name])),
    blockNumber: at.block,
    blockHash: `0x${"cd".repeat(32)}`,
    logIndex: at.index,
    transactionHash: TX,
    transactionIndex: 0,
    removed: false,
  } as Log;
}

const ctx = { chainId: 31337, contract: CONTRACT, blockTimestamp: (block: bigint) => 1_700_000_000 + Number(block) };

describe("toChainEvents", () => {
  const logs = [
    makeLog("Purchased", { orderId: ORDER, buyer: BUYER, total: 2000n, fee: 50n }, { block: 7n, index: 3 }),
    makeLog("TransferSingle", { operator: BUYER, from: ZERO, to: BUYER, id: 42n, value: 2n }, { block: 7n, index: 2 }),
    makeLog("EditionLocked", { tokenId: 42n, creator: CREATOR, maxSupply: 5n }, { block: 7n, index: 1 }),
  ];

  it("decodes the three LootVault events into lower-case, decimal-string envelopes", () => {
    const events = toChainEvents(logs, ctx);
    assert.deepEqual(
      events.map((e) => e.type),
      ["chain.EditionLocked", "chain.TransferSingle", "chain.Purchased"],
    );
    const purchased = events[2];
    assert.equal(purchased.id, `31337:${TX.toLowerCase()}:3`);
    assert.equal(purchased.txHash, TX.toLowerCase());
    assert.equal(purchased.blockNumber, 7);
    assert.equal(purchased.blockTimestamp, 1_700_000_007);
    assert.deepEqual(purchased.data, { orderId: ORDER.toLowerCase(), buyer: BUYER.toLowerCase(), total: "2000", fee: "50" });
    assert.deepEqual(events[1].data, { operator: BUYER.toLowerCase(), from: ZERO, to: BUYER.toLowerCase(), id: "42", value: "2" });
    assert.deepEqual(events[0].data, { tokenId: "42", creator: CREATOR.toLowerCase(), maxSupply: "5" });
  });

  it("drops logs from other contracts (forged events) and unrelated event types", () => {
    const forged = makeLog("Purchased", { orderId: ORDER, buyer: BUYER, total: 1n, fee: 0n }, { block: 8n, index: 0, address: CREATOR });
    const approval = makeLog("ApprovalForAll", { account: BUYER, operator: CREATOR, approved: true }, { block: 8n, index: 1 });
    assert.deepEqual(toChainEvents([forged, approval], ctx), []);
  });

  it("produces the same ids for the same logs regardless of input order (fast-path == indexer)", () => {
    const a = toChainEvents(logs, ctx).map((e) => e.id);
    const b = toChainEvents([...logs].reverse(), ctx).map((e) => e.id);
    assert.deepEqual(a, b);
  });

  it("stamps an optional correlation id", () => {
    const [event] = toChainEvents([logs[0]], { ...ctx, correlationId: "req-1" });
    assert.equal(event.correlationId, "req-1");
  });
});
