import type { INestApplication } from "@nestjs/common";
import { createTestApp, startMongo } from "@lootvault/nest-common/testing";
import request from "supertest";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

import { AppModule } from "./app.module";

// anvil's public test accounts #3 and #4
const publisher = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
const stranger = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");

describe("auth-svc (SIWE -> JWT)", () => {
  let mongo: Awaited<ReturnType<typeof startMongo>>;
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    mongo = await startMongo();
    app = await createTestApp(AppModule, {
      prefix: "auth",
      env: {
        MONGO_URL: mongo.uri,
        AUTH_DB: "auth_test",
        JWT_SECRET: "test-secret-at-least-16",
        CHAIN_ID: "31337",
        SIWE_ALLOWED_DOMAINS: "localhost:3000,localhost:3100",
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  async function signIn(overrides: { domain?: string; chainId?: number; signer?: typeof publisher } = {}) {
    const nonceRes = await http().get("/auth/nonce").query({ address: publisher.address }).expect(200);
    const message = createSiweMessage({
      address: publisher.address,
      chainId: overrides.chainId ?? 31337,
      domain: overrides.domain ?? "localhost:3000",
      nonce: nonceRes.body.nonce,
      uri: "http://localhost:3000",
      version: "1",
    });
    const signature = await (overrides.signer ?? publisher).signMessage({ message });
    return { message, signature };
  }

  it("issues a JWT for a valid signed message and resolves /auth/me", async () => {
    const { message, signature } = await signIn();
    const res = await http().post("/auth/verify").send({ message, signature }).expect(200);
    expect(res.body.address).toBe(publisher.address.toLowerCase());

    const me = await http().get("/auth/me").set("authorization", `Bearer ${res.body.accessToken}`).expect(200);
    expect(me.body.address).toBe(publisher.address.toLowerCase());
  });

  it("rejects a replayed message because the nonce is single-use", async () => {
    const signed = await signIn();
    await http().post("/auth/verify").send(signed).expect(200);
    const replay = await http().post("/auth/verify").send(signed).expect(401);
    expect(replay.body.error.code).toBe("NONCE_INVALID");
  });

  it.each([
    [{ domain: "evil.example" }, "SIWE_DOMAIN_NOT_ALLOWED"],
    [{ chainId: 1 }, "SIWE_WRONG_CHAIN"],
    [{ signer: stranger }, "SIWE_BAD_SIGNATURE"],
  ])("rejects %o with %s", async (overrides, code) => {
    const signed = await signIn(overrides);
    const res = await http().post("/auth/verify").send(signed).expect(401);
    expect(res.body.error.code).toBe(code);
  });

  it("validates input and requires a bearer token", async () => {
    const bad = await http().get("/auth/nonce").query({ address: "not-an-address" }).expect(400);
    expect(bad.body.error.code).toBe("VALIDATION_FAILED");
    const anon = await http().get("/auth/me").expect(401);
    expect(anon.body.error.code).toBe("UNAUTHORIZED");
  });
});
