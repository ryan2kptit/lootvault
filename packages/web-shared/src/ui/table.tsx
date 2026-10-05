import type { ComponentProps } from "react";

import { cn } from "./cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("border-b bg-muted/50 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b px-4 py-3 align-middle [tr:last-child_&]:border-0", className)} {...props} />;
}
