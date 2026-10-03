import { Button } from "@lootvault/web-shared/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Previous / next for an offset-paginated list ({ page, limit, total }). */
export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages === 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft /> Previous
      </Button>
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight />
      </Button>
    </div>
  );
}
