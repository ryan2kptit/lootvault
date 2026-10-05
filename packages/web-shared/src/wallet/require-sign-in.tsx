"use client";

import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { LoadingState } from "../ui/feedback";
import { useSession } from "./session";
import { useSiweLogin } from "./use-siwe-login";
import { WalletButton } from "./wallet-button";

/** Renders `children` only for a signed-in wallet; otherwise walks the user through connect and sign in. */
export function RequireSignIn({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { address, walletStatus, session } = useSession();
  const login = useSiweLogin();

  if (walletStatus === "connecting" || walletStatus === "reconnecting") return <LoadingState label="Restoring your wallet…" />;
  if (session) return children;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="size-6" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {address ? (
        <Button onClick={() => login.mutate()} disabled={login.isPending}>
          {login.isPending ? "Check your wallet…" : "Sign in with Ethereum"}
        </Button>
      ) : (
        <WalletButton />
      )}
    </div>
  );
}
