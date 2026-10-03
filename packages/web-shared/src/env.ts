declare global {
  namespace NodeJS {
    /** Checked at startup by `lootVaultNextConfig` (next-config.ts), so they are always set. */
    interface ProcessEnv {
      readonly NEXT_PUBLIC_API_URL: string;
      readonly NEXT_PUBLIC_CHAIN_ID: string;
      readonly NEXT_PUBLIC_RPC_URL: string;
      readonly NEXT_PUBLIC_STOREFRONT_URL: string;
    }
  }
}

/** Browser-safe settings. Each `process.env.NEXT_PUBLIC_*` must be spelled out so Next can inline it. */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
  storefrontUrl: process.env.NEXT_PUBLIC_STOREFRONT_URL,
};
