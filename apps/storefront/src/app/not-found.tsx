import { buttonVariants, EmptyState } from "@lootvault/web-shared/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <EmptyState
      title="Not found"
      description="This store or item does not exist, or is no longer for sale."
      action={<Link href="/" className={buttonVariants({ variant: "outline" })}>Browse stores</Link>}
    />
  );
}
