import { buttonVariants, cn } from "@lootvault/web-shared/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/** Previous / next links; `href(page)` keeps the other search params. */
export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  const linkClass = (disabled: boolean) => cn(buttonVariants({ variant: "outline", size: "sm" }), disabled && "pointer-events-none opacity-50");
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
      <Link href={href(page - 1)} aria-disabled={page <= 1} className={linkClass(page <= 1)}>
        <ChevronLeft /> Previous
      </Link>
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Link href={href(page + 1)} aria-disabled={page >= pages} className={linkClass(page >= pages)}>
        Next <ChevronRight />
      </Link>
    </nav>
  );
}
