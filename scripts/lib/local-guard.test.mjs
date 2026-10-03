import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { assertLocalAwsEndpoint, assertLocalRpc } from "./local-guard.mjs";

/** Tiny JSON-RPC server that answers eth_chainId with a fixed value. */
function chainServer(chainIdHex) {
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: chainIdHex }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

describe("assertLocalRpc", () => {
  let anvil;
  let mainnet;
  before(async () => {
    anvil = await chainServer("0x7a69");
    mainnet = await chainServer("0x1");
  });
  after(() => {
    anvil.close();
    mainnet.close();
  });

  it("accepts a loopback RPC that reports chainId 31337", async () => {
    await assertLocalRpc(`http://127.0.0.1:${anvil.address().port}`);
    await assertLocalRpc(`http://LOCALHOST:${anvil.address().port}`);
  });

  it("rejects a loopback RPC that reports another chain", async () => {
    await assert.rejects(assertLocalRpc(`http://127.0.0.1:${mainnet.address().port}`), /chainId 1.*31337/);
  });

  it("rejects non-loopback hosts without calling them", async () => {
    await assert.rejects(assertLocalRpc("https://mainnet.example.com/v2/secret"), /mainnet\.example\.com/);
    await assert.rejects(assertLocalRpc("http://10.0.0.5:8545"), /10\.0\.0\.5/);
  });

  it("does not leak URL credentials or path in the message", async () => {
    await assert.rejects(assertLocalRpc("https://user:hunter2@rpc.example.com/KEY123"), (error) => {
      assert.doesNotMatch(error.message, /hunter2|KEY123/);
      return true;
    });
  });

  it("rejects an unset or malformed RPC url", async () => {
    await assert.rejects(assertLocalRpc(undefined), /RPC_URL/);
    await assert.rejects(assertLocalRpc("not a url"), /RPC_URL/);
  });

  it("reports an unreachable local RPC", async () => {
    await assert.rejects(assertLocalRpc("http://127.0.0.1:1"), /127\.0\.0\.1/);
  });
});

describe("assertLocalAwsEndpoint", () => {
  it("accepts loopback endpoints in any case, including IPv6", () => {
    assertLocalAwsEndpoint("http://localhost:4566");
    assertLocalAwsEndpoint("http://127.0.0.1:4566");
    assertLocalAwsEndpoint("http://[::1]:4566");
    assertLocalAwsEndpoint("http://LocalHost:4566");
  });

  it("rejects an unset endpoint (the SDK would fall back to real AWS)", () => {
    assert.throws(() => assertLocalAwsEndpoint(undefined), /AWS_ENDPOINT_URL/);
    assert.throws(() => assertLocalAwsEndpoint(""), /AWS_ENDPOINT_URL/);
  });

  it("rejects remote and malformed endpoints", () => {
    assert.throws(() => assertLocalAwsEndpoint("https://s3.amazonaws.com"), /s3\.amazonaws\.com/);
    assert.throws(() => assertLocalAwsEndpoint("http://localhost.evil.com"), /localhost\.evil\.com/);
    assert.throws(() => assertLocalAwsEndpoint("nonsense"), /AWS_ENDPOINT_URL/);
  });
});
