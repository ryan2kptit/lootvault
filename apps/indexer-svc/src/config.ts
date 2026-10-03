import { isAddress } from "viem";
import { z } from "zod";

export const indexerConfigSchema = z.object({
  INDEXER_PORT: z.coerce.number().int().default(3004),
  MONGO_URL: z.string().min(1),
  INDEXER_DB: z.string().default("lootvault_indexer"),
  CHAIN_ID: z.coerce.number().int(),
  RPC_URL: z.string().url(),
  CONTRACT_ADDRESS: z
    .string()
    .refine((value) => isAddress(value), "must be an address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
  /** Deploy block of the contract (inclusive). */
  START_BLOCK: z.coerce.number().int().nonnegative(),
  /** Blocks to wait before reading (reorg safety): 0 locally, 3 on Base Sepolia. */
  CONFIRMATIONS: z.coerce.number().int().nonnegative().default(0),
  BATCH_SIZE: z.coerce.number().int().positive().default(500),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  /** Local only: run the polling loop in-process (on AWS a scheduled Lambda calls catchUp()). */
  INDEXER_LOOP: z.stringbool().default(false),
  AWS_REGION: z.string().default("ap-southeast-1"),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  SNS_TOPIC_ARN: z.string().min(1),
});

export type IndexerConfig = z.infer<typeof indexerConfigSchema>;
