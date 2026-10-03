"use client";

import { Card, CardContent } from "@lootvault/web-shared/ui";
import { useRouter } from "next/navigation";

import { ItemForm } from "@/components/item-form";
import { RequireStore } from "@/components/require-store";

export default function NewItemPage() {
  const router = useRouter();
  return (
    <RequireStore>
      {() => (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold">New item</h1>
            <p className="text-sm text-muted-foreground">Saved as a draft. Publish it from the items list when it is ready.</p>
          </div>
          <Card>
            <CardContent>
              <ItemForm onSaved={() => router.push("/items")} />
            </CardContent>
          </Card>
        </div>
      )}
    </RequireStore>
  );
}
