"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createSiweMessage } from "viem/siwe";
import { useConnection, useSignMessage } from "wagmi";

import { publicEnv } from "../env";
import { useApi, useSession } from "./session";
import { errorMessage } from "./tx-errors";

/** Sign-In with Ethereum: nonce -> EIP-4361 message -> wallet signature -> POST /auth/verify -> stored JWT. */
export function useSiweLogin() {
  const api = useApi();
  const { setSession } = useSession();
  const { address } = useConnection();
  const { mutateAsync: signMessage } = useSignMessage();

  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Connect a wallet first.");
      const { nonce } = await api.auth.nonce(address);
      const message = createSiweMessage({
        address,
        chainId: publicEnv.chainId,
        domain: window.location.host,
        uri: window.location.origin,
        nonce,
        version: "1",
        statement: "Sign in to LootVault",
      });
      return api.auth.verify(message, await signMessage({ message }));
    },
    onSuccess: setSession,
    onError: (error) => toast.error(errorMessage(error)),
  });
}
