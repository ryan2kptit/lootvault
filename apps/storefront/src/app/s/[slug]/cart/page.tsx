"use client";

import { isApiError } from "@lootvault/web-shared/api";
import { cartTotalWei, MAX_LINE_QUANTITY, useCart } from "@lootvault/web-shared/cart";
import { Button, buttonVariants, Card, CardContent, EmptyState, PriceTag } from "@lootvault/web-shared/ui";
import { describeTxError, useApi, useSession } from "@lootvault/web-shared/wallet";
import { ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { toast } from "sonner";

import { PurchaseProgress } from "@/components/purchase-progress";
import { QuantityPicker } from "@/components/quantity-picker";
import { SignInToBuy } from "@/components/sign-in-to-buy";
import { usePurchase } from "@/hooks/use-purchase";

export default function CartPage({ params }: PageProps<"/s/[slug]/cart">) {
  const { slug } = use(params);
  const api = useApi();
  const { session } = useSession();
  const { lines, setQuantity, capQuantity, remove, clear } = useCart(slug, (cart) => cart);

  /** Brings the cart back in line with the stock after the checkout or the contract refused it. */
  async function syncStock(error: unknown) {
    if (isApiError(error, "INSUFFICIENT_STOCK") || isApiError(error, "ITEM_UNAVAILABLE")) {
      const itemId = error.detail("itemId");
      const available = error.detail("available");
      if (typeof itemId === "string") capQuantity(itemId, typeof available === "number" ? available : 0);
    } else if (describeTxError(error).code === "SoldOut") {
      const items = await Promise.all(lines.map((line) => api.catalog.getItem(line.itemId).catch(() => null)));
      lines.forEach((line, index) => capQuantity(line.itemId, items[index]?.status === "LIVE" ? items[index].remaining : 0));
    }
  }

  const { state, purchase } = usePurchase({ onError: (error) => void syncStock(error) });
  const busy = state.status === "running";

  async function checkout() {
    const order = await purchase(lines.map(({ itemId, quantity }) => ({ itemId, quantity })));
    if (order) {
      clear();
      toast.success("Payment confirmed. Your NFTs are in your collection.");
    }
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {state.status === "done" ? <PurchaseProgress state={state} /> : null}
        <EmptyState
          icon={<ShoppingCart />}
          title="Your cart is empty"
          description="Add items from this store, then pay for all of them in one transaction."
          action={<Link href={`/s/${slug}`} className={buttonVariants({ variant: "outline" })}>Browse the store</Link>}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {lines.map((line) => (
          <li key={line.itemId} className="flex items-center gap-4 p-4">
            <img src={line.imageUrl} alt="" className="size-16 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <Link href={`/s/${slug}/items/${line.itemId}`} className="block truncate font-medium hover:underline">
                {line.name}
              </Link>
              <PriceTag wei={line.priceWei} className="text-sm text-muted-foreground" />
            </div>
            <QuantityPicker value={line.quantity} max={MAX_LINE_QUANTITY} onChange={(quantity) => setQuantity(line.itemId, quantity)} disabled={busy} />
            <Button variant="ghost" size="icon" aria-label={`Remove ${line.name}`} onClick={() => remove(line.itemId)} disabled={busy}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Card className="h-fit">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <PriceTag wei={cartTotalWei(lines)} className="text-xl" />
          </div>
          <p className="text-xs text-muted-foreground">One transaction pays for every item. Prices and stock are checked again at checkout.</p>
          {session ? (
            <Button size="lg" onClick={() => void checkout()} disabled={busy}>
              {busy ? "Processing…" : "Checkout"}
            </Button>
          ) : (
            <SignInToBuy />
          )}
          <PurchaseProgress state={state} />
        </CardContent>
      </Card>
    </div>
  );
}
