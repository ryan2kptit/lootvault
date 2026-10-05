"use client";

import { isApiError, type Item, type ItemInput } from "@lootvault/web-shared/api";
import { ethToWei, weiToEthInput } from "@lootvault/web-shared/format";
import { Button, Field, Input, Textarea } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ImageUpload } from "./image-upload";

type FieldErrors = Partial<Record<"image" | "supply" | "price", string>>;

/** Create a draft (no `item`) or edit an existing item. Supply is read-only once a copy has sold. */
export function ItemForm({ item, onSaved }: { item?: Item; onSaved: (item: Item) => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [supply, setSupply] = useState(String(item?.supply ?? 10));
  const [price, setPrice] = useState(item ? weiToEthInput(item.priceWei) : "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploading, setUploading] = useState(false);
  const supplyLocked = (item?.sold ?? 0) > 0;

  const save = useMutation({
    mutationFn: (input: ItemInput) => (item ? api.catalog.updateItem(item.id, input) : api.catalog.createItem(input)),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["my-items"] });
      toast.success(item ? "Changes saved" : `${saved.name} saved as a draft`);
      onSaved(saved);
    },
    onError: (error) => {
      if (isApiError(error, "SUPPLY_LOCKED")) setErrors({ supply: error.message });
      else if (isApiError(error, "IMAGE_NOT_HOSTED")) setErrors({ image: error.message });
      else toast.error(errorMessage(error));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const priceWei = ethToWei(price);
    const copies = Number(supply);
    const next: FieldErrors = {
      image: imageUrl ? undefined : "Upload an image.",
      supply: Number.isInteger(copies) && copies >= 1 && copies <= 10_000 ? undefined : "Between 1 and 10,000 copies.",
      price: priceWei ? undefined : "Enter a price in ETH, for example 0.01.",
    };
    setErrors(next);
    if (!priceWei || Object.values(next).some(Boolean)) return;
    save.mutate({ name, description, imageUrl, supply: copies, priceWei });
  }

  return (
    <form onSubmit={submit} className="grid gap-8 md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Image</span>
        <ImageUpload value={imageUrl} onChange={setImageUrl} label="Upload artwork" invalid={errors.image !== undefined} onUploadingChange={setUploading} />
        {errors.image ? <p className="text-xs text-destructive">{errors.image}</p> : null}
      </div>
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ember Drake" />
        </Field>
        <Field label="Description" htmlFor="description">
          <Textarea id="description" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Supply (copies)"
            htmlFor="supply"
            error={errors.supply}
            hint={supplyLocked ? "Locked: the edition size was fixed on-chain at the first sale." : "Editable until the first sale."}
          >
            <Input
              id="supply"
              type="number"
              min={1}
              max={10_000}
              value={supply}
              disabled={supplyLocked}
              aria-invalid={errors.supply !== undefined}
              onChange={(event) => setSupply(event.target.value)}
            />
          </Field>
          <Field label="Price (ETH)" htmlFor="price" error={errors.price}>
            <Input id="price" inputMode="decimal" value={price} aria-invalid={errors.price !== undefined} onChange={(event) => setPrice(event.target.value)} placeholder="0.01" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending || uploading}>
            {save.isPending ? "Saving…" : uploading ? "Uploading image…" : item ? "Save changes" : "Create draft"}
          </Button>
        </div>
      </div>
    </form>
  );
}
