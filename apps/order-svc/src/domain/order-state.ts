export const ORDER_STATUSES = ["PENDING", "PAID", "EXPIRED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * PENDING -> PAID     on a Purchased event
 * PENDING -> EXPIRED  when the deadline (+ grace) passes without one
 * EXPIRED -> PAID     when the event arrives late: the chain is the source of truth
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PAID", "EXPIRED"],
  EXPIRED: ["PAID"],
  PAID: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses an order may be in for a conditional update to `to` (use as `status: { $in: ... }`). */
export function statusesThatCanBecome(to: OrderStatus): OrderStatus[] {
  return ORDER_STATUSES.filter((from) => canTransition(from, to));
}
