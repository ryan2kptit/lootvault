const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Mongo ObjectId (24 hex chars) -> uint256 tokenId. */
export function tokenIdFromItemId(itemId: string): bigint {
  if (!OBJECT_ID.test(itemId)) throw new Error(`Not a Mongo ObjectId: ${itemId}`);
  return BigInt(`0x${itemId}`);
}

/** uint256 tokenId -> Mongo ObjectId hex (lower-case, left-padded to 24 chars). */
export function itemIdFromTokenId(tokenId: bigint): string {
  return tokenId.toString(16).padStart(24, "0");
}

/** ERC-1155 `{id}` substitution: 64 lower-case hex chars, no 0x prefix. */
export function metadataFileName(tokenId: bigint): string {
  return `${tokenId.toString(16).padStart(64, "0")}.json`;
}
