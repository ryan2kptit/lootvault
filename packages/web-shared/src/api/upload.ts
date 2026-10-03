import { ApiError } from "./errors";
import type { PresignedUpload } from "./types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Sends a file straight to S3 with a presigned POST (fields first, file last) and resolves to its public URL.
 * Uses XMLHttpRequest because fetch cannot report upload progress.
 */
export function uploadImage(upload: PresignedUpload, file: File, onProgress: (percent: number) => void): Promise<string> {
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
  form.append("file", file);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(upload.publicUrl);
      else reject(new ApiError(request.status, "UPLOAD_FAILED", "The image upload was rejected. Use a PNG, JPEG, WebP or GIF up to 5 MB."));
    };
    request.onerror = () => reject(ApiError.network());
    request.open("POST", upload.url);
    request.send(form);
  });
}
