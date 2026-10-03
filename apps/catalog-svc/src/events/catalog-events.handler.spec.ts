import type { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { startMongo } from "@lootvault/nest-common/testing";
import type { ChainEvent } from "@lootvault/shared";
import type { Model } from "mongoose";
import request from "supertest";

import { Holding } from "../holdings/holding.schema";
import { Item } from "../items/item.schema";
import { bearer, createCatalogTestApp, FakeMediaStorage } from "../test-support";
import { CatalogEventsHandler } from "./catalog-events.handler";

const OWNER = "0x90f79bf6eb2c4f870365e785982e1f101e93b906";
const BUYER = "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc";
const FRIEND = "0x976ea74026e726554db657fa54763abd0c3a0aa9";
const ZERO = "0x0000000000000000000000000000000000000000";

let seq = 0;
const envelope = (type: ChainEvent["type"], data: unknown): ChainEvent =>
  ({ id: `31337:0xtx:${++seq}`, type, chainId: 31337, blockNumber: 1, blockTimestamp: 1, txHash: "0xtx", logIndex: seq, data }) as ChainEvent;

describe("CatalogEventsHandler", () => {
  let mongo: Awaited<ReturnType<typeof startMongo>>;
  let app: INestApplication;
  let handler: CatalogEventsHandler;
  let items: Model<Item>;
  let holdings: Model<Holding>;
  let tokenId: string;
  let itemId: string;

  beforeAll(async () => {
    mongo = await startMongo();
    app = await createCatalogTestApp(mongo.uri, new FakeMediaStorage());
    handler = app.get(CatalogEventsHandler);
    items = app.get(getModelToken(Item.name));
    holdings = app.get(getModelToken(Holding.name));

    const auth = bearer(app, OWNER);
    await request(app.getHttpServer()).post("/catalog/stores").set("authorization", auth).send({ slug: "evt-store", name: "Evt" }).expect(201);
    const item = await request(app.getHttpServer())
      .post("/catalog/items")
      .set("authorization", auth)
      .send({ name: "Evt Card", imageUrl: "http://media.test/media/a.png", supply: 3, priceWei: "100" })
      .expect(201);
    tokenId = item.body.tokenId;
    itemId = item.body.id;
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it("mirrors the on-chain edition size from EditionLocked", async () => {
    await handler.handle(envelope("chain.EditionLocked", { tokenId, creator: OWNER, maxSupply: "4" }));
    expect((await items.findById(itemId))?.supply).toBe(4);
    expect((await items.findById(itemId))?.editionLocked).toBe(true);
  });

  it("refuses supply edits once the chain locked the edition, even while sold is still 0", async () => {
    // catalog-q is a standard queue: EditionLocked can arrive before the mint's TransferSingle moves `sold`.
    const auth = bearer(app, OWNER);
    const http = () => request(app.getHttpServer());
    const created = await http()
      .post("/catalog/items")
      .set("authorization", auth)
      .send({ name: "Race Card", imageUrl: "http://media.test/media/b.png", supply: 5, priceWei: "100" })
      .expect(201);
    expect((await items.findById(created.body.id))?.editionLocked).toBe(false);

    await handler.handle(envelope("chain.EditionLocked", { tokenId: created.body.tokenId, creator: OWNER, maxSupply: "5" }));
    expect((await items.findById(created.body.id))?.sold).toBe(0);

    const locked = await http().patch(`/catalog/items/${created.body.id}`).set("authorization", auth).send({ supply: 2 }).expect(409);
    expect(locked.body.error.code).toBe("SUPPLY_LOCKED");
    await http().patch(`/catalog/items/${created.body.id}`).set("authorization", auth).send({ priceWei: "7" }).expect(200);
  });

  it("counts mints as sold and credits the buyer, exactly once per event", async () => {
    const mint = envelope("chain.TransferSingle", { operator: BUYER, from: ZERO, to: BUYER, id: tokenId, value: "2" });
    await handler.handle(mint);
    await handler.handle(mint); // redelivered

    expect((await items.findById(itemId))?.sold).toBe(2);
    expect((await holdings.findById(`${BUYER}:${tokenId}`))?.balance).toBe(2);
  });

  it("moves balances on secondary transfers without touching sold", async () => {
    await handler.handle(envelope("chain.TransferSingle", { operator: BUYER, from: BUYER, to: FRIEND, id: tokenId, value: "1" }));
    expect((await holdings.findById(`${BUYER}:${tokenId}`))?.balance).toBe(1);
    expect((await holdings.findById(`${FRIEND}:${tokenId}`))?.balance).toBe(1);
    expect((await items.findById(itemId))?.sold).toBe(2);

    const collection = await request(app.getHttpServer()).get(`/catalog/holdings/${FRIEND}`).expect(200);
    expect(collection.body).toEqual([expect.objectContaining({ tokenId, balance: 1, item: expect.objectContaining({ id: itemId }) })]);
  });

  it("ignores tokens that are not catalog items", async () => {
    const outOfRange = (1n << 200n).toString();
    await handler.handle(envelope("chain.TransferSingle", { operator: BUYER, from: ZERO, to: BUYER, id: outOfRange, value: "1" }));
    await handler.handle(envelope("chain.TransferSingle", { operator: BUYER, from: ZERO, to: BUYER, id: "12345", value: "1" }));
    expect(await holdings.countDocuments({ tokenId: { $in: [outOfRange, "12345"] } })).toBe(0);
  });

  describe("robustness", () => {
    const ALICE = "0x14dc79964da2c08b23698b3d3cc7ca32193d9955";
    const BOB = "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f";

    it("converges when a transfer is delivered before the mint that funds it", async () => {
      const soldBefore = (await items.findById(itemId))?.sold ?? 0;
      await handler.handle(envelope("chain.TransferSingle", { operator: ALICE, from: ALICE, to: BOB, id: tokenId, value: "1" }));
      await handler.handle(envelope("chain.TransferSingle", { operator: ALICE, from: ZERO, to: ALICE, id: tokenId, value: "2" }));

      expect((await holdings.findById(`${ALICE}:${tokenId}`))?.balance).toBe(1);
      expect((await holdings.findById(`${BOB}:${tokenId}`))?.balance).toBe(1);
      expect((await items.findById(itemId))?.sold).toBe(soldBefore + 2);
    });

    it("debits the burner on a burn without creating a zero-address holding or touching sold", async () => {
      const soldBefore = (await items.findById(itemId))?.sold;
      await handler.handle(envelope("chain.TransferSingle", { operator: BOB, from: BOB, to: ZERO, id: tokenId, value: "1" }));

      expect((await holdings.findById(`${BOB}:${tokenId}`))?.balance).toBe(0);
      expect(await holdings.countDocuments({ address: ZERO })).toBe(0);
      expect((await items.findById(itemId))?.sold).toBe(soldBefore);
    });

    it("treats a malformed tokenId as a no-op instead of throwing", async () => {
      const before = await holdings.countDocuments({});
      await expect(
        handler.handle(envelope("chain.TransferSingle", { operator: BUYER, from: ZERO, to: BUYER, id: "abc", value: "1" })),
      ).resolves.toBeUndefined();
      expect(await holdings.countDocuments({})).toBe(before);
    });
  });
});
