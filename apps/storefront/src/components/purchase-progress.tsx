"use client";

import { buttonVariants, TxStatusStepper } from "@lootvault/web-shared/ui";
import Link from "next/link";

import { PURCHASE_STEPS, type PurchaseState } from "@/hooks/use-purchase";

/** The stepper for a purchase in progress, plus a link to the collection once paid (or sent and awaiting confirmation). */
export function PurchaseProgress({ state }: { state: PurchaseState }) {
  if (state.status === "idle") return null;
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-4">
      <TxStatusStepper
        steps={PURCHASE_STEPS}
        current={state.step}
        status={state.status === "submitted" ? "running" : state.status}
        error={state.status === "error" ? state.error : undefined}
      />
      {state.status === "submitted" ? (
        <p role="status" className="text-sm">
          <span className="font-medium">Payment sent — confirmation pending.</span>{" "}
          <span className="text-muted-foreground">Do not pay again: your NFTs appear in My collection once the payment is confirmed.</span>
        </p>
      ) : null}
      {state.status === "done" || state.status === "submitted" ? (
        <Link href="/me" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {state.status === "done" ? "View my collection" : "Check my orders"}
        </Link>
      ) : null}
    </div>
  );
}
