import { z } from "zod";

export const catalogConfigSchema = z.object({
  CATALOG_PORT: z.coerce.number().int().default(3002),
  MONGO_URL: z.string().min(1),
  CATALOG_DB: z.string().default("lootvault_catalog"),
  JWT_SECRET: z.string().min(16),
  INTERNAL_API_KEY: z.string().min(16),
  AWS_REGION: z.string().default("ap-southeast-1"),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  MEDIA_BUCKET: z.string().default("lootvault-media"),
  /** Public base URL of the media bucket, e.g. http://localhost:4566/lootvault-media */
  MEDIA_PUBLIC_URL: z.string().url(),
  /** Used for the `external_url` field of token metadata. */
  STOREFRONT_URL: z.string().url().default("http://localhost:3100"),
  CATALOG_QUEUE_URL: z.string().url().optional(),
  /** Local only: poll CATALOG_QUEUE_URL in-process (on AWS a Lambda event source does it). */
  SQS_POLLING: z.stringbool().default(false),
});

export type CatalogConfig = z.infer<typeof catalogConfigSchema>;
