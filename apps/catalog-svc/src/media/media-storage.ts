import { randomUUID } from "node:crypto";

import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

export const MEDIA_STORAGE = Symbol("MEDIA_STORAGE");

export const IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type ImageContentType = keyof typeof IMAGE_EXTENSIONS;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface PresignedUpload {
  /** POST target for a multipart form: all `fields`, then the `file` field last. */
  url: string;
  fields: Record<string, string>;
  key: string;
  publicUrl: string;
}

export interface MediaStorage {
  presignImageUpload(contentType: ImageContentType): Promise<PresignedUpload>;
  /** Writes a JSON document and returns its public URL. */
  putJson(key: string, document: unknown): Promise<string>;
}

/** S3 (moto locally): browsers upload directly with a size- and type-restricted presigned POST. */
export class S3MediaStorage implements MediaStorage {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {}

  async presignImageUpload(contentType: ImageContentType): Promise<PresignedUpload> {
    const key = `media/${randomUUID()}.${IMAGE_EXTENSIONS[contentType]}`;
    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ["content-length-range", 1, MAX_IMAGE_BYTES],
        ["eq", "$Content-Type", contentType],
      ],
      Fields: { "Content-Type": contentType },
      Expires: 300,
    });
    return { url, fields, key, publicUrl: `${this.publicBaseUrl}/${key}` };
  }

  async putJson(key: string, document: unknown): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(document),
        ContentType: "application/json",
        CacheControl: "no-cache",
      }),
    );
    return `${this.publicBaseUrl}/${key}`;
  }
}
