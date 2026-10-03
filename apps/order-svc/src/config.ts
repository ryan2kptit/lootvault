import { isAddress } from "viem";
import { z } from "zod";

export const orderConfigSchema = z.object({
  ORDER_PORT: z.coerce.number().int().default(3003),
  MONGO_URL: z.string().min(1),
  ORDER_DB: z.string().default("lootvault_order"),
  JWT_SECRET: z.string().min(16),
  INTERNAL_API_KEY: z.string().min(16),
  CATALOG_URL: z.string().url().default("http://localhost:3002"),
  CHAIN_ID: z.coerce.number().int(),
  RPC_URL: z.string().url(),
  CONTRACT_ADDRESS: z
    .string()
    .refine((value) => isAddress(value), "must be an address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
  PLATFORM_SIGNER_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte hex private key").transform((v) => v as `0x${string}`),
  CHECKOUT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Extra time after the deadline before a PENDING order expires (indexer lag). */
  EXPIRY_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(120),
  AWS_REGION: z.string().default("ap-southeast-1"),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  SNS_TOPIC_ARN: z.string().default(""),
  ORDER_QUEUE_URL: z.string().url().optional(),
  SQS_POLLING: z.stringbool().default(false),
  SWEEPER_ENABLED: z.stringbool().default(false),
});

export type OrderConfig = z.infer<typeof orderConfigSchema>;
