"use client";

import { isApiError, type Store } from "@lootvault/web-shared/api";
import { Button, buttonVariants, EmptyState, ErrorState, LoadingState } from "@lootvault/web-shared/ui";
import { errorMessage, RequireSignIn } from "@lootvault/web-shared/wallet";
import { Store as StoreIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useMyStore } from "@/hooks/use-my-store";

function StoreGate({ children }: { children: (store: Store) => ReactNode }) {
  const store = useMyStore();
  if (store.isPending) return <LoadingState label="Loading your store…" />;
  if (store.isError) {
    if (isApiError(store.error, "STORE_NOT_FOUND")) {
      return (
        <EmptyState
          icon={<StoreIcon />}
          title="You don't have a store yet"
          description="Create your store first, then come back here."
          action={<Link href="/" className={buttonVariants()}>Create your store</Link>}
        />
      );
    }
    return <ErrorState message={errorMessage(store.error)} action={<Button variant="outline" onClick={() => store.refetch()}>Try again</Button>} />;
  }
  return children(store.data);
}

/** Studio pages: signed in, with a store. `children` receives the store. */
export function RequireStore({ children }: { children: (store: Store) => ReactNode }) {
  return (
    <RequireSignIn title="Sign in to LootVault Studio" description="Connect the wallet that owns your store and sign in to continue.">
      <StoreGate>{children}</StoreGate>
    </RequireSignIn>
  );
}
