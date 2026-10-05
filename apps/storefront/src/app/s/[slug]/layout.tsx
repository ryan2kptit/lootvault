import Link from "next/link";

import { CartLink } from "@/components/cart-link";
import { StoreLogo } from "@/components/store-logo";
import { getStore } from "@/lib/server-api";

export default async function StoreLayout({ children, params }: LayoutProps<"/s/[slug]">) {
  const { slug } = await params;
  const store = await getStore(slug);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <StoreLogo store={store} className="size-16" />
        <div className="min-w-0 flex-1">
          <Link href={`/s/${store.slug}`} className="text-2xl font-semibold hover:underline">
            {store.name}
          </Link>
          {store.description ? <p className="text-sm text-muted-foreground">{store.description}</p> : null}
        </div>
        <CartLink slug={store.slug} />
      </header>
      {children}
    </div>
  );
}
