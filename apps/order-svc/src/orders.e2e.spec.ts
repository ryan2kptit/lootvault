import type { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { startMongo } from "@lootvault/nest-common/testing";
import { checkoutFromWire, checkoutTypedData, type CheckoutWire } from "@lootvault/shared";
import type { Model } from "mongoose";
import request from "supertest";
import { type Hex, recoverTypedDataAddress } from "viem";

import type { CatalogItem } from "./domain/catalog-item";
import { PurchasedHandler } from "./events/purchased.handler";
import { OrderSweeper } from "./orders/order-sweeper";
import { Order } from "./orders/order.schema";
import { bearer, CONTRACT, createOrderTestApp, encodeLog, FakeCatalog, FakeChain, FakePublisher, PLATFORM, receipt } from "./test-support";

const SELLER = "0x90f79bf6eb2c4f870365e785982e1f101e93b906";
const BUYER = "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc";
const OTHER = "0x976ea74026e726554db657fa54763abd0c3a0aa9";
const ZERO = "0x0000000000000000000000000000000000000000";
const ITEM_A = "66fd2c1e9b1d4a0012ab0001";
const ITEM_B = "66fd2c1e9b1d4a0012ab0002";
const ITEM_OTHER_STORE = "66fd2c1e9b1d4a0012ab0003";

const catalogItem = (id: string, overrides: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  storeId: "store-1",
  storeSlug: "pixel-legends",
  ownerAddress: SELLER,
  tokenId: BigInt(`0x${id}`).toString(),
  name: `Card ${id.slice(-1)}`,
  imageUrl: "http://media.test/a.png",
  status: "LIVE",
  priceWei: "1000",
  supply: 5,
  sold: 0,
  ...overrides,
});

let txSeq = 0;
const nextTx = (): Hex => `0x${(++txSeq).toString(16).padStart(64, "0")}`;

describe("order-svc", () => {
  let mongo: Awaited<ReturnType<typeof startMongo>>;
  let app: INestApplication;
  let orders: Model<Order>;
  const catalog = new FakeCatalog();
  const chain = new FakeChain();
  const publisher = new FakePublisher();
  const http = () => request(app.getHttpServer());
  const asBuyer = () => bearer(app, BUYER);

  beforeAll(async () => {
    mongo = await startMongo();
    app = await createOrderTestApp(mongo.uri, { catalog, chain, publisher });
    orders = app.get(getModelToken(Order.name));
    catalog.items.set(ITEM_A, catalogItem(ITEM_A, { supply: 100 })); // many tests hold PENDING copies of A
    catalog.items.set(ITEM_B, catalogItem(ITEM_B, { priceWei: "250", supply: 1 }));
    catalog.items.set(ITEM_OTHER_STORE, catalogItem(ITEM_OTHER_STORE, { storeId: "store-2" }));
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  function checkout(lines: { itemId: string; quantity: number }[], token = asBuyer()) {
    return http().post("/orders/checkout").set("authorization", token).send({ lines });
  }

  /** Simulates the buyer's on-chain purchase and returns a receipt containing the contract's logs. */
  function mined(body: { order: { orderId: Hex; totalWei: string }; purchase: { checkout: CheckoutWire } }, extraLogs = [] as ReturnType<typeof encodeLog>[]) {
    const txHash = nextTx();
    const line = body.purchase.checkout.lines[0];
    chain.receipts.set(
      txHash,
      receipt(txHash, [
        encodeLog("TransferSingle", { operator: BUYER, from: ZERO, to: BUYER, id: BigInt(line.tokenId), value: BigInt(line.quantity) }, 0),
        encodeLog("Purchased", { orderId: body.order.orderId, buyer: BUYER, total: BigInt(body.order.totalWei), fee: 25n }, 1),
        ...extraLogs,
      ]),
    );
    return txHash;
  }

  describe("checkout", () => {
    it("creates a PENDING order and returns a checkout signed by the platform key", async () => {
      const res = await checkout([{ itemId: ITEM_A, quantity: 2 }, { itemId: ITEM_B, quantity: 1 }]).expect(201);
      const { order, purchase } = res.body;

      expect(order).toMatchObject({ status: "PENDING", buyer: BUYER, sellerAddress: SELLER, storeSlug: "pixel-legends", totalWei: "2250" });
      expect(purchase).toMatchObject({ chainId: 31337, contract: CONTRACT, value: "2250" });
      expect(purchase.checkout.lines[0]).toEqual({ tokenId: catalogItem(ITEM_A).tokenId, creator: SELLER, quantity: "2", unitPrice: "1000", maxSupply: "100" });

      const signer = await recoverTypedDataAddress({
        ...checkoutTypedData(31337, CONTRACT, checkoutFromWire(purchase.checkout)),
        signature: purchase.signature,
      });
      expect(signer).toBe(PLATFORM);
      expect(Number(purchase.checkout.deadline) - Math.floor(Date.now() / 1000)).toBeGreaterThan(290);
    });

    it.each([
      [[{ itemId: ITEM_A, quantity: 11 }], 400, "VALIDATION_FAILED"],
      [[{ itemId: ITEM_A, quantity: 1 }, { itemId: ITEM_A, quantity: 1 }], 400, "CART_INVALID"],
      [[{ itemId: ITEM_A, quantity: 1 }, { itemId: ITEM_OTHER_STORE, quantity: 1 }], 400, "MIXED_STORES"],
      [[{ itemId: "66fd2c1e9b1d4a0012ab0999", quantity: 1 }], 409, "ITEM_UNAVAILABLE"],
    ])("rejects %j with %s %s", async (lines, status, code) => {
      const res = await checkout(lines).expect(status);
      expect(res.body.error.code).toBe(code);
    });

    it("soft-reserves copies held by unexpired PENDING orders", async () => {
      // ITEM_B has supply 1 and the first test's order still holds it.
      const res = await checkout([{ itemId: ITEM_B, quantity: 1 }]).expect(409);
      expect(res.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK", details: { itemId: ITEM_B, available: 0 } });
    });

    it("caps the open checkouts one buyer can hold", async () => {
      const capped = await createOrderTestApp(mongo.uri, { catalog, chain, publisher }, { MAX_PENDING_ORDERS_PER_BUYER: "2" });
      try {
        const token = bearer(capped, BUYER);
        const place = () => request(capped.getHttpServer()).post("/orders/checkout").set("authorization", token).send({ lines: [{ itemId: ITEM_A, quantity: 1 }] });
        await place().expect(201);
        await place().expect(201);
        const res = await place().expect(429);
        expect(res.body.error).toMatchObject({ code: "TOO_MANY_PENDING_ORDERS", details: { max: 2 } });
        // Another account is unaffected.
        await request(capped.getHttpServer())
          .post("/orders/checkout")
          .set("authorization", bearer(capped, OTHER))
          .send({ lines: [{ itemId: ITEM_A, quantity: 1 }] })
          .expect(201);
      } finally {
        await capped.close();
      }
    });

    it("fails closed when the catalog is down", async () => {
      catalog.down = true;
      const res = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(503);
      catalog.down = false;
      expect(res.body.error.code).toBe("CATALOG_UNAVAILABLE");
    });
  });

  describe("confirm (fast-path)", () => {
    it("answers 202 while the transaction is not mined", async () => {
      const { body } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      const res = await http().post(`/orders/${body.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash: nextTx() }).expect(202);
      expect(res.body).toEqual({ status: "PENDING_TX" });
    });

    it("marks the order PAID from the receipt and publishes the decoded events once", async () => {
      const { body } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      const txHash = mined(body);
      publisher.published.length = 0;

      const res = await http().post(`/orders/${body.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash }).expect(200);
      expect(res.body.order).toMatchObject({ status: "PAID", txHash, feeWei: "25" });
      expect(publisher.published.map((e) => e.type)).toEqual(["chain.TransferSingle", "chain.Purchased"]);

      // Confirming again (double click) and the indexer's copy of the event change nothing.
      await http().post(`/orders/${body.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash }).expect(200);
      await app.get(PurchasedHandler).handle(publisher.published[1]);
      expect(await orders.countDocuments({ orderId: body.order.orderId, status: "PAID" })).toBe(1);
    });

    it("ignores forged Purchased logs emitted by another contract", async () => {
      const { body } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      const txHash = nextTx();
      chain.receipts.set(
        txHash,
        receipt(txHash, [encodeLog("Purchased", { orderId: body.order.orderId, buyer: BUYER, total: 1000n, fee: 0n }, 0, OTHER)]),
      );
      const res = await http().post(`/orders/${body.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash }).expect(422);
      expect(res.body.error.code).toBe("TX_MISMATCH");
    });

    it("rejects a valid transaction that paid a different order", async () => {
      const { body: orderA } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      const { body: orderB } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      const paidB = mined(orderB);
      const res = await http().post(`/orders/${orderA.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash: paidB }).expect(422);
      expect(res.body.error.code).toBe("TX_MISMATCH");
      expect((await orders.findOne({ orderId: orderA.order.orderId }))?.status).toBe("PENDING");
    });

    it("rejects a Purchased event whose total differs from the order total", async () => {
      const { body } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      const txHash = nextTx();
      chain.receipts.set(
        txHash,
        receipt(txHash, [encodeLog("Purchased", { orderId: body.order.orderId, buyer: BUYER, total: BigInt(body.order.totalWei) - 1n, fee: 0n }, 0)]),
      );
      const res = await http().post(`/orders/${body.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash }).expect(422);
      expect(res.body.error.code).toBe("TX_MISMATCH");
    });

    it("waits for CONFIRMATIONS blocks, then confirms and publishes", async () => {
      const slowChain = new FakeChain();
      const slowPublisher = new FakePublisher();
      const deep = await createOrderTestApp(mongo.uri, { catalog, chain: slowChain, publisher: slowPublisher }, { CONFIRMATIONS: "2" });
      try {
        const token = bearer(deep, BUYER);
        const server = deep.getHttpServer();
        const { body } = await request(server).post("/orders/checkout").set("authorization", token).send({ lines: [{ itemId: ITEM_A, quantity: 1 }] }).expect(201);
        const txHash = nextTx();
        slowChain.receipts.set(
          txHash,
          receipt(txHash, [
            encodeLog("TransferSingle", { operator: BUYER, from: ZERO, to: BUYER, id: BigInt(body.purchase.checkout.lines[0].tokenId), value: 1n }, 0),
            encodeLog("Purchased", { orderId: body.order.orderId, buyer: BUYER, total: BigInt(body.order.totalWei), fee: 25n }, 1),
          ]),
        );
        const confirm = () => request(server).post(`/orders/${body.order.id}/confirm`).set("authorization", token).send({ txHash });

        slowChain.head = 13n; // receipt in block 12: one block deep, needs 2
        expect((await confirm().expect(202)).body).toEqual({ status: "PENDING_TX" });
        expect(slowPublisher.published).toHaveLength(0);

        slowChain.head = 14n;
        const res = await confirm().expect(200);
        expect(res.body.order.status).toBe("PAID");
        expect(slowPublisher.published).toHaveLength(2);
      } finally {
        await deep.close();
      }
    });

    it("rejects failed transactions, other contracts and other buyers", async () => {
      const { body } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      const reverted = mined(body);
      chain.receipts.set(reverted, { ...chain.receipts.get(reverted)!, status: "reverted" });
      expect((await http().post(`/orders/${body.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash: reverted }).expect(422)).body.error.code).toBe("TX_INVALID");

      const ok = mined(body);
      await http().post(`/orders/${body.order.id}/confirm`).set("authorization", bearer(app, OTHER)).send({ txHash: ok }).expect(404);
    });
  });

  describe("lifecycle", () => {
    it("expires stale PENDING orders and lets a late Purchased event mark them PAID", async () => {
      const { body } = await checkout([{ itemId: ITEM_A, quantity: 1 }]).expect(201);
      await orders.updateOne({ orderId: body.order.orderId }, { $set: { deadline: new Date(Date.now() - 10 * 60_000) } });

      expect(await app.get(OrderSweeper).sweep()).toBeGreaterThanOrEqual(1);
      expect((await orders.findOne({ orderId: body.order.orderId }))?.status).toBe("EXPIRED");

      const txHash = mined(body);
      await http().post(`/orders/${body.order.id}/confirm`).set("authorization", asBuyer()).send({ txHash }).expect(200);
      expect((await orders.findOne({ orderId: body.order.orderId }))?.status).toBe("PAID");
    });

    it("reports seller stats, sales lists and public recent sales", async () => {
      const seller = bearer(app, SELLER);
      const stats = await http().get("/orders/store/me/stats").set("authorization", seller).expect(200);
      expect(stats.body.ordersPaid).toBe(2);
      expect(BigInt(stats.body.grossWei)).toBe(2000n);
      expect(BigInt(stats.body.netWei)).toBe(2000n - 50n);
      expect(stats.body.itemsSold).toBe(2);
      expect(stats.body.last7Days).toHaveLength(7);

      const sales = await http().get("/orders/store/me").query({ status: "PAID" }).set("authorization", seller).expect(200);
      expect(sales.body.total).toBe(2);

      const recent = await http().get("/orders/recent-sales").query({ itemId: ITEM_A }).expect(200);
      expect(recent.body).toHaveLength(2);
      expect(recent.body[0]).toMatchObject({ buyer: BUYER, quantity: 1 });

      const mine = await http().get("/orders/me").set("authorization", asBuyer()).expect(200);
      expect(mine.body.total).toBeGreaterThanOrEqual(5);
    });
  });
});
