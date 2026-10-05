import { Providers } from "@lootvault/web-shared/wallet";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StudioHeader } from "@/components/studio-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LootVault Studio", template: "%s · LootVault Studio" },
  description: "Run your LootVault store: list NFT editions, publish them and track sales.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers app="studio">
          <StudioHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
