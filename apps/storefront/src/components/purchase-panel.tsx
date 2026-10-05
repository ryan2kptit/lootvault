"use client";

import type { PublicItem } from "@lootvault/web-shared/api";
import { MAX_CART_LINES, MAX_LINE_QUANTITY, useCart } from "@lootvault/web-shared/cart";
import { Button } from "@lootvault/web-shared/ui";
import { useSession } from "@lootvault/web-shared/wallet";
import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { isPurchaseLocked, usePurchase } from "@/hooks/use-purchase";

import { PurchaseProgress } from "./purchase-progress";
import { QuantityPicker } from "./quantity-picker";
import { SignInToBuy } from "./sign-in-to-buy";

/** Quantity, "Add to cart" and "Buy now" for one item. Stock comes from the server render and refreshes after a purchase. */
export function PurchasePanel({ item, slug }: { item: PublicItem; slug: string }) {
  const router = useRouter();
  const { session } = useSession();
  const addToCart = useCart(slug, (cart) => cart.add);
  const cartLines = useCart(slug, (cart) => cart.lines);
  const max = Math.min(item.remaining, MAX_LINE_QUANTITY);
  const [wanted, setWanted] = useState(1);
  const quantity = Math.min(wanted, max); // the stock can drop after a refresh
  // Any failure may mean the stock or the price moved (SoldOut, INSUFFICIENT_STOCK, a new price): re-render the page with fresh numbers.
  const { state, purchase } = usePurchase({
    onError: () => router.refresh(),
    onPaid: () => {
      toast.success(`You own ${quantity} × ${item.name}`);
      router.refresh();
    },
    onPending: () => {
      toast.info("Payment sent. Your NFT appears once it is confirmed.");
      router.refresh();
    },
  });
  // A payment that was sent but not confirmed yet must never be paid again.
  const busy = isPurchaseLocked(state);

  if (item.remaining <= 0) return <p className="font-medium text-destructive">Sold out</p>;

  function add() {
    // The cart store merges into an existing line and refuses a new line past its limits; report what it will really do.
    const inCart = cartLines.find((line) => line.itemId === item.id)?.quantity ?? 0;
    const added = inCart === 0 && cartLines.length >= MAX_CART_LINES ? 0 : Math.max(0, Math.min(inCart + quantity, max) - inCart);
    addToCart({ itemId: item.id, name: item.name, imageUrl: item.imageUrl, priceWei: item.priceWei }, quantity, item.remaining);
    if (added === 0) {
      toast.error(`Cart is full (max ${MAX_LINE_QUANTITY} per line / ${MAX_CART_LINES} lines)`);
      return;
    }
    toast.success(`Added ${added} × ${item.name} to your cart`, {
      action: { label: "View cart", onClick: () => router.push(`/s/${slug}/cart`) },
    });
  }

  function buyNow() {
    return purchase([{ itemId: item.id, name: item.name, imageUrl: item.imageUrl, priceWei: item.priceWei, quantity }]);
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
