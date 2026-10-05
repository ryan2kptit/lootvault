"use client";

import { isApiError } from "@lootvault/web-shared/api";
import { Button, ErrorState, LoadingState } from "@lootvault/web-shared/ui";
import { errorMessage, RequireSignIn } from "@lootvault/web-shared/wallet";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { OnboardingForm } from "@/components/onboarding-form";
import { useMyStore } from "@/hooks/use-my-store";

function StoreHome() {
  const store = useMyStore();
  const router = useRouter();

  useEffect(() => {
    if (store.data) router.replace("/dashboard");
  }, [store.data, router]);

  if (isApiError(store.error, "STORE_NOT_FOUND")) return <OnboardingForm />;
  if (store.isError) {
    return <ErrorState message={errorMessage(store.error)} action={<Button variant="outline" onClick={() => store.refetch()}>Try again</Button>} />;
  }
  return <LoadingState label="Opening your store…" />;
}

export default function HomePage() {
  return (
    <RequireSignIn title="Welcome to LootVault Studio" description="Sell NFT editions of your game cards. Connect your wallet and sign in to open or manage your store.">
      <StoreHome />
    </RequireSignIn>
  );
}
