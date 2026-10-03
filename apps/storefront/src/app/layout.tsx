import { Providers } from "@lootvault/web-shared/wallet";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL),
  title: { default: "LootVault", template: "%s · LootVault" },
  description: "Collect NFT editions of game cards from independent stores.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers app="storefront">
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
