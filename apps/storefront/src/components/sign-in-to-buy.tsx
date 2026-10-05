"use client";

import { Button } from "@lootvault/web-shared/ui";
import { useSession, useSiweLogin, WalletButton } from "@lootvault/web-shared/wallet";

/** Shown instead of the buy button until the wallet is connected and signed in. */
export function SignInToBuy() {
  const { address } = useSession();
  const login = useSiweLogin();
  if (!address) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        Connect a wallet to buy.
        <WalletButton />
      </div>
    );
  }
  return (
    <Button size="lg" onClick={() => login.mutate()} disabled={login.isPending}>
      {login.isPending ? "Check your wallet…" : "Sign in to buy"}
    </Button>
  );
}
