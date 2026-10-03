"use client";

import type { Item } from "@lootvault/web-shared/api";
import { Button } from "@lootvault/web-shared/ui";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** Publish (DRAFT/HIDDEN -> LIVE) or unpublish (LIVE -> HIDDEN) an item. */
export function PublishButton({ item }: { item: Item }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const live = item.status === "LIVE";
  const toggle = useMutation({
    mutationFn: () => (live ? api.catalog.unpublishItem(item.id) : api.catalog.publishItem(item.id)),
    onSuccess: (updated) => {
      toast.success(updated.status === "LIVE" ? `${updated.name} is live` : `${updated.name} is hidden from the storefront`);
      return queryClient.invalidateQueries({ queryKey: ["my-items"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Button variant={live ? "outline" : "primary"} size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
      {live ? "Unpublish" : "Publish"}
    </Button>
  );
}
