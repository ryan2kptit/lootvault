import type { Chain } from "viem";
import { createConfig, http, injected } from "wagmi";
import { anvil, baseSepolia } from "wagmi/chains";

import { publicEnv } from "../env";
import { demoWallet } from "./demo-wallet";

const SUPPORTED_CHAINS: readonly Chain[] = [anvil, baseSepolia];

/** Chain from NEXT_PUBLIC_CHAIN_ID / NEXT_PUBLIC_RPC_URL; the injected wallet always, the demo wallet on anvil only. */
export function createWagmiConfig() {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === publicEnv.chainId);
  if (!chain) throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID ${publicEnv.chainId}`);
  return createConfig({
    chains: [chain],
    connectors: chain.id === anvil.id ? [injected(), demoWallet(publicEnv.rpcUrl)] : [injected()],
    transports: { [chain.id]: http(publicEnv.rpcUrl) },
    ssr: true,
  });
}
