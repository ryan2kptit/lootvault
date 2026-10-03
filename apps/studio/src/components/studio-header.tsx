"use client";

import { publicEnv } from "@lootvault/web-shared/env";
import { buttonVariants, cn } from "@lootvault/web-shared/ui";
import { WalletButton } from "@lootvault/web-shared/wallet";
import { ExternalLink, Gem } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useMyStore } from "@/hooks/use-my-store";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/items", label: "Items" },
  { href: "/orders", label: "Orders" },
];

export function StudioHeader() {
  const pathname = usePathname();
  const { data: store } = useMyStore();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Gem className="size-5 text-primary" />
          LootVault <span className="font-normal text-muted-foreground">Studio</span>
        </Link>
        {store ? (
          <nav className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  pathname.startsWith(item.href) && "bg-muted font-medium text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {store ? (
            <a href={`${publicEnv.storefrontUrl}/s/${store.slug}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              View storefront <ExternalLink />
            </a>
          ) : null}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
