import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "./badge";
import { PriceTag } from "./price-tag";

export function StockBadge({ remaining }: { remaining: number }) {
  if (remaining <= 0) return <Badge tone="destructive">Sold out</Badge>;
  return <Badge tone={remaining <= 3 ? "warning" : "neutral"}>{remaining} left</Badge>;
}

interface NftCardProps {
  href: string;
  name: string;
  imageUrl: string;
  priceWei: string;
  /** Top-right badge; defaults to nothing. Pass <StockBadge> on store pages. */
  badge?: ReactNode;
  footer?: ReactNode;
}

export function NftCard({ href, name, imageUrl, priceWei, badge, footer }: NftCardProps) {
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        {/* Plain <img>: media is served by S3 (moto locally); next/image would need per-environment remotePatterns. */}
        <img src={imageUrl} alt={name} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />
        {badge ? <div className="absolute right-2 top-2 rounded-full bg-card/90 shadow-sm backdrop-blur">{badge}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate font-medium">{name}</p>
        <PriceTag wei={priceWei} className="text-sm" />
        {footer}
      </div>
    </Link>
  );
}
