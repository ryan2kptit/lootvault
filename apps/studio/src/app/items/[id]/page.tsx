"use client";

import { publicEnv } from "@lootvault/web-shared/env";
import { Button, buttonVariants, Card, CardContent, ErrorState, LoadingState } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { use } from "react";

import { ItemForm } from "@/components/item-form";
import { ItemStatusBadge } from "@/components/item-status-badge";
import { PublishButton } from "@/components/publish-button";
import { RequireStore } from "@/components/require-store";

function EditItem({ id, slug }: { id: string; slug: string }) {
  const api = useApi();
  const router = useRouter();
  // Owners read their drafts and hidden items through the public item route (it accepts the owner's token).
  const item = useQuery({ queryKey: ["my-items", "item", id], queryFn: () => api.catalog.getItem(id) });

  if (item.isPending) return <LoadingState label="Loading item…" />;
  if (item.isError) return <ErrorState message={errorMessage(item.error)} action={<Button variant="outline" onClick={() => item.refetch()}>Try again</Button>} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{item.data.name}</h1>
          <ItemStatusBadge status={item.data.status} />
        </div>
        <div className="flex items-center gap-2">
          {item.data.status === "LIVE" ? (
            <a href={`${publicEnv.storefrontUrl}/s/${slug}/items/${id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              View in storefront <ExternalLink />
            </a>
          ) : null}
          <PublishButton item={item.data} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {item.data.sold} of {item.data.supply} copies sold · token #{item.data.tokenId}
      </p>
      <Card>
        <CardContent>
          <ItemForm key={item.data.updatedAt} item={item.data} onSaved={() => router.push("/items")} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function EditItemPage({ params }: PageProps<"/items/[id]">) {
  const { id } = use(params);
  return <RequireStore>{(store) => <EditItem id={id} slug={store.slug} />}</RequireStore>;
}
