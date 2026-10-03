/** The authenticated principal: a wallet address, always lower-case. */
export interface AuthUser {
  address: `0x${string}`;
}

export interface AuthConfig {
  JWT_SECRET: string;
  JWT_TTL_SECONDS?: number;
  INTERNAL_API_KEY?: string;
}
