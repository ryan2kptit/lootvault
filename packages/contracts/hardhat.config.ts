import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// Single source of local config: the monorepo root .env.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    },
  },
  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: process.env.RPC_URL ?? "http://127.0.0.1:8545",
      accounts: [configVariable("DEPLOYER_KEY")],
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("BASE_SEPOLIA_DEPLOYER_KEY")],
    },
  },
});
