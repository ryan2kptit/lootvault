import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createTestApp } from "@lootvault/nest-common/testing";

import { AppModule } from "./app.module";
import { MEDIA_STORAGE, type MediaStorage } from "./media/media-storage";

export const INTERNAL_KEY = "internal-key-for-tests";

/** In-memory MediaStorage that records written JSON documents. */
export class FakeMediaStorage implements MediaStorage {
  readonly documents = new Map<string, unknown>();
  /** Set to make the next putJson reject once (simulates an S3 outage). */
  failNextPut = false;

  async presignImageUpload(contentType: string) {
    return { url: "http://media.test/upload", fields: { "Content-Type": contentType }, key: "media/x.png", publicUrl: "http://media.test/media/x.png" };
  }

  async putJson(key: string, document: unknown) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("S3 unavailable");
    }
    this.documents.set(key, document);
    return `http://media.test/${key}`;
  }
}

export async function createCatalogTestApp(mongoUri: string, media: MediaStorage): Promise<INestApplication> {
  return createTestApp(AppModule, {
    prefix: "catalog",
    env: {
      MONGO_URL: mongoUri,
      CATALOG_DB: `catalog_test_${Date.now()}`,
      JWT_SECRET: "test-secret-at-least-16",
      INTERNAL_API_KEY: INTERNAL_KEY,
      MEDIA_PUBLIC_URL: "http://media.test",
      SQS_POLLING: "false",
    },
    override: (builder) => builder.overrideProvider(MEDIA_STORAGE).useValue(media),
  });
}

export const bearer = (app: INestApplication, address: string) =>
  `Bearer ${app.get(JwtService).sign({ sub: address.toLowerCase() })}`;
