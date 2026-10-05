import type { ItemStatus } from "@lootvault/web-shared/api";
import { Badge, type BadgeProps } from "@lootvault/web-shared/ui";

const TONES: Record<ItemStatus, BadgeProps["tone"]> = { LIVE: "success", DRAFT: "neutral", HIDDEN: "warning" };
const LABELS: Record<ItemStatus, string> = { LIVE: "Live", DRAFT: "Draft", HIDDEN: "Hidden" };

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}
