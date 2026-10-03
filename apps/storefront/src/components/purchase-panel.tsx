"use client";

import type { PublicItem } from "@lootvault/web-shared/api";
import { MAX_LINE_QUANTITY, useCart } from "@lootvault/web-shared/cart";
import { Button } from "@lootvault/web-shared/ui";
import { useSession } from "@lootvault/web-shared/wallet";
import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { usePurchase } from "@/hooks/use-purchase";

import { PurchaseProgress } from "./purchase-progress";
import { QuantityPicker } from "./quantity-picker";
import { SignInToBuy } from "./sign-in-to-buy";

/** Quantity, "Add to cart" and "Buy now" for one item. Stock comes from the server render and refreshes after a purchase. */
export function PurchasePanel({ item, slug }: { item: PublicItem; slug: string }) {
  const router = useRouter();
  const { session } = useSession();
  const addToCart = useCart(slug, (cart) => cart.add);
  const max = Math.min(item.remaining, MAX_LINE_QUANTITY);
  const [wanted, setWanted] = useState(1);
  const quantity = Math.min(wanted, max); // the stock can drop after a refresh
  // Any failure may mean the stock moved (SoldOut, INSUFFICIENT_STOCK): re-render the page with fresh numbers.
  const { state, purchase } = usePurchase({ onError: () => router.refresh() });
  const busy = state.status === "running";

  if (item.remaining <= 0) return <p className="font-medium text-destructive">Sold out</p>;

  function add() {
    addToCart({ itemId: item.id, name: item.name, imageUrl: item.imageUrl, priceWei: item.priceWei }, quantity, item.remaining);
    toast.success(`Added ${quantity} × ${item.name} to your cart`, {
      action: { label: "View cart", onClick: () => router.push(`/s/${slug}/cart`) },
    });
  }

  async function buyNow() {
    const order = await purchase([{ itemId: item.id, quantity }]);
    if (order) {
      toast.success(`You own ${quantity} × ${item.name}`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <QuantityPicker value={quantity} max={max} onChange={setWanted} disabled={busy} />
        <span className="text-sm text-muted-foreground">max {max} per order</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={add} disabled={busy}>
          <ShoppingCart /> Add to cart
        </Button>
        {session ? (
          <Button size="lg" onClick={() => void buyNow()} disabled={busy}>
            {busy ? "Processing…" : "Buy now"}
          </Button>
        ) : (
          <SignInToBuy />
        )}
      </div>
      <PurchaseProgress state={state} />
    </div>
  );
}
