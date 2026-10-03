"use client";

import { useApi, useSession } from "@lootvault/web-shared/wallet";
import { useQuery } from "@tanstack/react-query";

/** The signed-in publisher's store. Fails with ApiError STORE_NOT_FOUND until onboarding creates it. */
export function useMyStore() {
  const api = useApi();
  const { session } = useSession();
  return useQuery({
    queryKey: ["my-store", session?.address],
    queryFn: () => api.catalog.myStore(),
    enabled: session !== null,
  });
}
