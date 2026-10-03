import type { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { startMongo } from "@lootvault/nest-common/testing";
import { metadataKey } from "@lootvault/shared";
import type { Model } from "mongoose";
import request from "supertest";

import { Item } from "./items/item.schema";
import { bearer, createCatalogTestApp, FakeMediaStorage, INTERNAL_KEY } from "./test-support";

const ALICE = "0x90f79bf6eb2c4f870365e785982e1f101e93b906";
const BOB = "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65";
const ETH = 10n ** 18n;

describe("catalog-svc HTTP API", () => {
  let mongo: Awaited<ReturnType<typeof startMongo>>;
  let app: INestApplication;
  const media = new FakeMediaStorage();
  const http = () => request(app.getHttpServer());
  const asAlice = () => bearer(app, ALICE);
  const asBob = () => bearer(app, BOB);

  beforeAll(async () => {
    mongo = await startMongo();
    app = await createCatalogTestApp(mongo.uri, media);
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  async function createItem(fields: Record<string, unknown>) {
    const res = await http()
      .post("/catalog/items")
      .set("authorization", asAlice())
      .send({ name: "Card", imageUrl: "http://media.test/media/a.png", supply: 5, priceWei: (ETH / 100n).toString(), ...fields })
      .expect(201);
    return res.body;
  }

  describe("stores", () => {
    it("creates one store per wallet with a unique slug", async () => {
      const res = await http()
        .post("/catalog/stores")
        .set("authorization", asAlice())
        .send({ slug: "pixel-legends", name: "Pixel Legends", description: "Retro cards" })
        .expect(201);
      expect(res.body).toMatchObject({ slug: "pixel-legends", ownerAddress: ALICE });

      const again = await http().post("/catalog/stores").set("authorization", asAlice()).send({ slug: "other", name: "x" }).expect(409);
      expect(again.body.error.code).toBe("STORE_EXISTS");

      const taken = await http().post("/catalog/stores").set("authorization", asBob()).send({ slug: "pixel-legends", name: "x" }).expect(409);
      expect(taken.body.error.code).toBe("SLUG_TAKEN");
    });

    it("serves the caller's store, a store by slug and the store list", async () => {
      await http().get("/catalog/stores/me").set("authorization", asAlice()).expect(200);
      await http().get("/catalog/stores/me").set("authorization", asBob()).expect(404);
      expect((await http().get("/catalog/stores/pixel-legends").expect(200)).body.name).toBe("Pixel Legends");
      expect((await http().get("/catalog/stores").expect(200)).body.total).toBe(1);
    });

    it("validates the slug format", async () => {
      const res = await http().post("/catalog/stores").set("authorization", asBob()).send({ slug: "Bad Slug!", name: "x" }).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("items: studio lifecycle", () => {
    it("creates drafts that only the owner can see", async () => {
      const item = await createItem({ name: "Ember Drake" });
      expect(item).toMatchObject({ status: "DRAFT", supply: 5, sold: 0, remaining: 5, ownerAddress: ALICE });
      expect(BigInt(item.tokenId)).toBe(BigInt(`0x${item.id}`));

      await http().get(`/catalog/items/${item.id}`).expect(404);
      await http().get(`/catalog/items/${item.id}`).set("authorization", asAlice()).expect(200);
      expect((await http().get("/catalog/stores/pixel-legends/items").expect(200)).body.total).toBe(0);
    });

    it("publishes ERC-1155 metadata at metadata/<hex64>.json and lists the item", async () => {
      const item = await createItem({ name: "Frost Wyrm", description: "Ice breath" });
      const published = await http().post(`/catalog/items/${item.id}/publish`).set("authorization", asAlice()).expect(200);
      expect(published.body.status).toBe("LIVE");

      const doc = media.documents.get(metadataKey(BigInt(item.tokenId))) as Record<string, unknown>;
      expect(doc).toMatchObject({ name: "Frost Wyrm", description: "Ice breath", image: item.imageUrl });
      expect(doc.external_url).toBe(`http://localhost:3100/s/pixel-legends/items/${item.id}`);

      const page = await http().get("/catalog/stores/pixel-legends/items").expect(200);
      expect(page.body.items.map((i: { id: string }) => i.id)).toContain(item.id);
      const detail = await http().get(`/catalog/items/${item.id}`).expect(200);
      expect(detail.body.store).toMatchObject({ slug: "pixel-legends" });
    });

    it("rejects edits from another wallet and hides unpublished items", async () => {
      const item = await createItem({ name: "Thorn Golem" });
      await http().post(`/catalog/items/${item.id}/publish`).set("authorization", asAlice()).expect(200);
      const forbidden = await http().patch(`/catalog/items/${item.id}`).set("authorization", asBob()).send({ name: "x" }).expect(403);
      expect(forbidden.body.error.code).toBe("FORBIDDEN");

      await http().post(`/catalog/items/${item.id}/unpublish`).set("authorization", asAlice()).expect(200);
      await http().get(`/catalog/items/${item.id}`).expect(404);
    });

    it("locks the edition size once a copy has sold", async () => {
      const item = await createItem({ name: "Sun Phoenix" });
      await http().patch(`/catalog/items/${item.id}`).set("authorization", asAlice()).send({ supply: 7 }).expect(200);
      await app.get<Model<Item>>(getModelToken(Item.name)).updateOne({ _id: item.id }, { $set: { sold: 1 } });

      const locked = await http().patch(`/catalog/items/${item.id}`).set("authorization", asAlice()).send({ supply: 9 }).expect(409);
      expect(locked.body.error.code).toBe("SUPPLY_LOCKED");
      await http().patch(`/catalog/items/${item.id}`).set("authorization", asAlice()).send({ priceWei: "5" }).expect(200);
    });
  });

  describe("storefront search", () => {
    beforeAll(async () => {
      const items = [
        { name: "Storm Kraken", priceWei: (3n * ETH / 100n).toString(), supply: 2 },
        { name: "Storm Titan", priceWei: (1n * ETH / 100n).toString(), supply: 2 },
        { name: "Moss Sprite", priceWei: (2n * ETH / 100n).toString(), supply: 2 },
      ];
      for (const fields of items) {
        const item = await createItem(fields);
        await http().post(`/catalog/items/${item.id}/publish`).set("authorization", asAlice()).expect(200);
      }
      const titan = await app.get<Model<Item>>(getModelToken(Item.name)).findOne({ name: "Storm Titan" });
      await titan!.updateOne({ $set: { sold: 2 } });
    });

    const names = (res: request.Response) => res.body.items.map((i: { name: string }) => i.name);

    it("searches by text and sorts by price", async () => {
      const res = await http().get("/catalog/stores/pixel-legends/items").query({ q: "storm", sort: "price_asc" }).expect(200);
      expect(names(res)).toEqual(["Storm Titan", "Storm Kraken"]);
    });

    it("filters by price range and stock", async () => {
      const ranged = await http()
        .get("/catalog/stores/pixel-legends/items")
        .query({ minPrice: (2n * ETH / 100n).toString(), maxPrice: (3n * ETH / 100n).toString(), sort: "price_desc" })
        .expect(200);
      expect(names(ranged)).toEqual(["Storm Kraken", "Moss Sprite"]);

      const inStock = await http().get("/catalog/stores/pixel-legends/items").query({ q: "storm", inStock: "true" }).expect(200);
      expect(names(inStock)).toEqual(["Storm Kraken"]);
    });

    it("paginates", async () => {
      const res = await http().get("/catalog/stores/pixel-legends/items").query({ limit: 2, page: 2 }).expect(200);
      expect(res.body).toMatchObject({ page: 2, limit: 2 });
      expect(res.body.items).toHaveLength(Math.min(2, res.body.total - 2));
    });
  });

  describe("uploads and internal API", () => {
    it("presigns only image content types", async () => {
      await http().post("/catalog/uploads/presign").set("authorization", asAlice()).send({ contentType: "image/png" }).expect(201);
      const bad = await http().post("/catalog/uploads/presign").set("authorization", asAlice()).send({ contentType: "text/html" }).expect(400);
      expect(bad.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("serves fresh item data to services holding the internal key", async () => {
      const item = await createItem({ name: "Batch Me" });
      await http().post("/catalog/internal/items/batch").send({ ids: [item.id] }).expect(401);
      const res = await http().post("/catalog/internal/items/batch").set("x-internal-key", INTERNAL_KEY).send({ ids: [item.id] }).expect(200);
      expect(res.body).toEqual([
        expect.objectContaining({ id: item.id, storeSlug: "pixel-legends", ownerAddress: ALICE, status: "DRAFT", supply: 5, sold: 0 }),
      ]);
    });
  });
});
