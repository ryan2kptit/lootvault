"use client";

import { buttonVariants, TxStatusStepper } from "@lootvault/web-shared/ui";
import Link from "next/link";

import { PURCHASE_STEPS, type PurchaseState } from "@/hooks/use-purchase";

/** The stepper for a purchase in progress, plus a link to the collection once paid. */
export function PurchaseProgress({ state }: { state: PurchaseState }) {
  if (state.status === "idle") return null;
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-4">
      <TxStatusStepper steps={PURCHASE_STEPS} current={state.step} status={state.status} error={state.status === "error" ? state.error : undefined} />
      {state.status === "done" ? (
        <Link href="/me" className={buttonVariants({ variant: "outline", size: "sm" })}>
          View my collection
        </Link>
      ) : null}
    </div>
  );
}
