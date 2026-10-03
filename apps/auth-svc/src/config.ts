import { z } from "zod";

export const authConfigSchema = z.object({
  AUTH_PORT: z.coerce.number().int().default(3001),
  MONGO_URL: z.string().min(1),
  AUTH_DB: z.string().default("lootvault_auth"),
  JWT_SECRET: z.string().min(16),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(7200),
  CHAIN_ID: z.coerce.number().int(),
  /** Hosts allowed in the SIWE `domain` field, e.g. "localhost:3000,localhost:3100". */
  SIWE_ALLOWED_DOMAINS: z.string().transform((value) => value.split(",").map((d) => d.trim()).filter(Boolean)),
  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type AuthSvcConfig = z.infer<typeof authConfigSchema>;
