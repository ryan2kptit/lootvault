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
});
