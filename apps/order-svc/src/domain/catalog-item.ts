/** Item data as returned by catalog-svc's internal batch API. */
export interface CatalogItem {
  id: string;
  storeId: string;
  storeSlug: string;
  ownerAddress: `0x${string}`;
  tokenId: string;
  name: string;
  imageUrl: string;
  status: "DRAFT" | "LIVE" | "HIDDEN";
  priceWei: string;
  supply: number;
  sold: number;
}
