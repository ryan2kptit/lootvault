"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import { ApiError } from "../api";
import { type AppName, SessionProvider } from "./session";
import { createWagmiConfig } from "./wagmi-config";

/** Client errors (4xx) are final; network and server errors are retried twice. */
const retryTransient = (failureCount: number, error: Error) =>
  failureCount < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500);

/** Everything a page needs on the client: wallet (wagmi), server state (TanStack Query), SIWE session and toasts. */
export function Providers({ app, children }: { app: AppName; children: ReactNode }) {
  const [wagmiConfig] = useState(createWagmiConfig);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: retryTransient, staleTime: 5_000 } } }));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider app={app}>{children}</SessionProvider>
        <Toaster richColors position="bottom-right" />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
