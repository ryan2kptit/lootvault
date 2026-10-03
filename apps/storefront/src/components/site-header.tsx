import { WalletButton } from "@lootvault/web-shared/wallet";
import { Gem } from "lucide-react";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Gem className="size-5 text-primary" />
          LootVault
        </Link>
        <nav className="order-last flex w-full gap-1 text-sm sm:order-none sm:w-auto">
          <Link href="/" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            Stores
          </Link>
          <Link href="/me" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            My collection
          </Link>
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
