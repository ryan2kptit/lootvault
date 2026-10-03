import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isItemTokenId,
  itemIdFromTokenId,
  metadataFileName,
  metadataKey,
  tokenIdFromItemId,
  tokenIdHex64,
  tokenIdToString,
} from "./ids";

describe("ids", () => {
  const itemId = "66fd2c1e9b1d4a0012ab34cd";

  it("maps a Mongo ObjectId to a uint256 tokenId and back", () => {
    const tokenId = tokenIdFromItemId(itemId);
    assert.equal(tokenId, BigInt("0x66fd2c1e9b1d4a0012ab34cd"));
    assert.equal(itemIdFromTokenId(tokenId), itemId);
  });

  it("left-pads small tokenIds back to 24 hex chars", () => {
    assert.equal(itemIdFromTokenId(1n), "000000000000000000000001");
  });

  it("rejects strings that are not 24-char hex ObjectIds", () => {
    assert.throws(() => tokenIdFromItemId("not-an-id"), /ObjectId/);
  });

  it("builds the ERC-1155 {id} metadata file name (64 lowercase hex, no 0x)", () => {
    assert.equal(metadataFileName(tokenIdFromItemId(itemId)), `${"0".repeat(40)}66fd2c1e9b1d4a0012ab34cd.json`);
  });

  it("rejects tokenIds outside the 96-bit item range", () => {
    assert.equal(isItemTokenId((1n << 96n) - 1n), true);
    assert.equal(isItemTokenId(1n << 96n), false);
    assert.equal(isItemTokenId(-1n), false);
    assert.throws(() => itemIdFromTokenId(1n << 96n), /outside the item range/);
  });

  it("uses decimal strings as the canonical tokenId form", () => {
    assert.equal(tokenIdToString(tokenIdFromItemId(itemId)), BigInt("0x66fd2c1e9b1d4a0012ab34cd").toString(10));
  });

  it("derives the metadata object key from the 64-hex tokenId", () => {
    const tokenId = tokenIdFromItemId(itemId);
    assert.equal(tokenIdHex64(tokenId).length, 64);
    assert.equal(metadataKey(tokenId), `metadata/${tokenIdHex64(tokenId)}.json`);
  });
});
