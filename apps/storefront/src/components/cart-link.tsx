"use client";

import { cartCount, useCart } from "@lootvault/web-shared/cart";
import { buttonVariants } from "@lootvault/web-shared/ui";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";

export function CartLink({ slug }: { slug: string }) {
  const count = useCart(slug, (cart) => cartCount(cart.lines));
  return (
    <Link href={`/s/${slug}/cart`} className={buttonVariants({ variant: "outline" })}>
      <ShoppingCart /> Cart
      {count > 0 ? <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{count}</span> : null}
    </Link>
  );
}
