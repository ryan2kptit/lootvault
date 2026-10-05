import { buttonVariants, EmptyState } from "@lootvault/web-shared/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="This page does not exist in LootVault Studio."
      action={<Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to the dashboard</Link>}
    />
  );
}
