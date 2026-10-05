import type { OrderStatus } from "../api/types";
import { Badge, type BadgeProps } from "./badge";

const TONES: Record<OrderStatus, BadgeProps["tone"]> = { PAID: "success", PENDING: "warning", EXPIRED: "neutral" };
const LABELS: Record<OrderStatus, string> = { PAID: "Paid", PENDING: "Pending", EXPIRED: "Expired" };

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}
