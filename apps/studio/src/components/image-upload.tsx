"use client";

import { IMAGE_TYPES, type ImageType, MAX_IMAGE_BYTES, uploadImage } from "@lootvault/web-shared/api";
import { cn, Progress } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { ImagePlus } from "lucide-react";
import { useEffect, useId, useState } from "react";

const isImageType = (type: string): type is ImageType => IMAGE_TYPES.some((allowed) => allowed === type);

/** Picks an image and uploads it to S3 through a presigned POST, showing progress. Reports the public URL. */
export function ImageUpload({
  value,
  onChange,
  label,
  invalid,
  onUploadingChange,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  invalid?: boolean;
  /** Called with true while an upload is in progress, so the form around it can hold its submit button. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const api = useApi();
  const inputId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = progress !== null;

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  async function upload(file: File) {
    setError(null);
    if (!isImageType(file.type)) return setError("Use a PNG, JPEG, WebP or GIF image.");
    if (file.size > MAX_IMAGE_BYTES) return setError("The image must be 5 MB or smaller.");
    setProgress(0);
    try {
      const presigned = await api.catalog.presignUpload(file.type);
      onChange(await uploadImage(presigned, file, setProgress));
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className={cn(
          "relative flex aspect-square w-full max-w-56 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary",
          invalid && "border-destructive",
        )}
      >
        {value ? (
          <img src={value} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            <ImagePlus className="size-7" />
            {label}
          </>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      {uploading ? (
        <div className="flex max-w-56 items-center gap-2 text-xs text-muted-foreground">
          <Progress value={progress} /> {progress}%
        </div>
      ) : value ? (
        <p className="text-xs text-muted-foreground">Click the image to replace it.</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
