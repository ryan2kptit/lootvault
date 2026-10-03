import { redirect } from "next/navigation";

import { getItem } from "@/lib/server-api";

/** Short item link (`/items/{id}`), used where only the item id is known, e.g. holdings in My collection. */
export default async function ItemRedirect({ params }: PageProps<"/items/[id]">) {
  const { id } = await params;
  const item = await getItem(id);
  redirect(`/s/${item.store.slug}/items/${item.id}`);
}
