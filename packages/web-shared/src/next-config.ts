import { existsSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

import { SERVICES } from "./api/http";
import { SERVICE_ORIGIN_ENV, serviceOrigin } from "./api/service-origin";

const PUBLIC_ENV = ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_CHAIN_ID", "NEXT_PUBLIC_RPC_URL", "NEXT_PUBLIC_STOREFRONT_URL"];

/**
 * Next only reads .env files from the app's own directory, but the monorepo keeps one root .env.
 * Load it (variables already in the environment win), then fail fast on anything the apps need.
 */
function loadRootEnv(appDir: string): void {
  const rootEnv = path.resolve(appDir, "../../.env");
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const missing = [...PUBLIC_ENV, ...SERVICE_ORIGIN_ENV].filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`Missing ${missing.join(", ")} in the root .env. Run \`npm run bootstrap\` to add new keys.`);
}

/** Config shared by Studio and Storefront. `appDir` is the app's directory (where next.config.ts lives). */
export function lootVaultNextConfig(appDir: string): NextConfig {
  loadRootEnv(appDir);
  return {
    // web-shared ships TypeScript source, compiled by each app.
    transpilePackages: ["@lootvault/web-shared"],
    // Keep `next dev` from writing AGENTS.md/CLAUDE.md into the apps.
    agentRules: false,
    // Browser calls go to same-origin /api/<service>/*, proxied to the service (no CORS, one public base URL).
    async rewrites() {
      return SERVICES.map((service) => ({ source: `/api/${service}/:path*`, destination: `${serviceOrigin(service)}/${service}/:path*` }));
    },
  };
}
