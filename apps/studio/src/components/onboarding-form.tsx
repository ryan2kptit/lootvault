"use client";

import { isApiError } from "@lootvault/web-shared/api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Textarea } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ImageUpload } from "./image-upload";

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

/** First visit of a wallet without a store: name, URL slug, description and logo. */
export function OnboardingForm() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [slugError, setSlugError] = useState<string>();

  const createStore = useMutation({
    mutationFn: () => api.catalog.createStore({ name, slug, description: description || undefined, logoUrl: logoUrl || undefined }),
    onSuccess: (store) => {
      toast.success(`${store.name} is open for business`);
      return queryClient.invalidateQueries({ queryKey: ["my-store"] });
    },
    onError: (error) => {
      if (isApiError(error, "SLUG_TAKEN")) setSlugError(error.message);
      else toast.error(errorMessage(error));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!SLUG.test(slug)) return setSlugError("3-32 characters: lower-case letters, digits and inner dashes.");
    setSlugError(undefined);
    createStore.mutate();
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Open your store</CardTitle>
        <CardDescription>One store per wallet. You can list items as soon as it exists.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-6 sm:grid-cols-[1fr_14rem]">
          <div className="flex flex-col gap-4">
            <Field label="Store name" htmlFor="name">
              <Input
                id="name"
                required
                maxLength={60}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugEdited) setSlug(slugify(event.target.value));
                }}
                placeholder="Pixel Legends"
              />
            </Field>
            <Field label="Store URL" htmlFor="slug" hint={`/s/${slug || "your-store"}`} error={slugError}>
              <Input
                id="slug"
                required
                value={slug}
                aria-invalid={slugError !== undefined}
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value.toLowerCase());
                }}
                placeholder="pixel-legends"
              />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Logo</span>
            <ImageUpload value={logoUrl} onChange={setLogoUrl} label="Upload logo" />
          </div>
          <Button type="submit" size="lg" className="sm:col-span-2" disabled={createStore.isPending}>
            {createStore.isPending ? "Creating…" : "Create store"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
