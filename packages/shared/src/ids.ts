const OBJECT_ID = /^[0-9a-f]{24}$/i;
/** Item tokenIds come from 12-byte Mongo ObjectIds, so they are always below 2^96. */
const ITEM_TOKEN_ID_LIMIT = 1n << 96n;

/** Mongo ObjectId (24 hex chars) -> uint256 tokenId. */
export function tokenIdFromItemId(itemId: string): bigint {
  if (!OBJECT_ID.test(itemId)) throw new Error(`Not a Mongo ObjectId: ${itemId}`);
  return BigInt(`0x${itemId}`);
}

/** True when a tokenId can belong to a catalog item (0 <= id < 2^96). */
export function isItemTokenId(tokenId: bigint): boolean {
  return tokenId >= 0n && tokenId < ITEM_TOKEN_ID_LIMIT;
}

/**
 * uint256 tokenId -> Mongo ObjectId hex (lower-case, left-padded to 24 chars).
 * Throws for ids outside the item range (e.g. minted with a leaked signer key);
 * consumers should treat such tokens as unknown.
 */
export function itemIdFromTokenId(tokenId: bigint): string {
  if (!isItemTokenId(tokenId)) throw new Error(`tokenId ${tokenId} is outside the item range`);
  return tokenId.toString(16).padStart(24, "0");
}

/** Canonical tokenId form in the database, events and APIs: a decimal string. */
export function tokenIdToString(tokenId: bigint): string {
  return tokenId.toString(10);
}

/** ERC-1155 `{id}` substitution value: 64 lower-case hex chars, no 0x prefix. */
export function tokenIdHex64(tokenId: bigint): string {
  return tokenId.toString(16).padStart(64, "0");
}

/** File name of a token's metadata JSON: `<tokenIdHex64>.json`. */
export function metadataFileName(tokenId: bigint): string {
  return `${tokenIdHex64(tokenId)}.json`;
}

/**
 * Object-storage key of a token's metadata. Matches the contract URI template
 * `<base>/metadata/{id}.json`, so never append it to a template that already ends in `{id}.json`.
 */
export function metadataKey(tokenId: bigint): string {
  return `metadata/${metadataFileName(tokenId)}`;
}
