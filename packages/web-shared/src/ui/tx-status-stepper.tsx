import { Check, X } from "lucide-react";

import { cn } from "./cn";
import { Spinner } from "./feedback";

type StepperStatus = "running" | "error" | "done";

interface TxStatusStepperProps {
  steps: readonly string[];
  /** Index of the step in progress (or the one that failed). */
  current: number;
  status: StepperStatus;
  /** Shown under the failed step. */
  error?: string;
}

/** Vertical progress of a multi-step transaction; an error is shown at the step where it happened. */
export function TxStatusStepper({ steps, current, status, error }: TxStatusStepperProps) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((label, index) => {
        const done = index < current || (status === "done" && index === current);
        const failed = status === "error" && index === current;
        const active = status === "running" && index === current;
        return (
          <li key={label} className="flex gap-3" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                done && "border-success bg-success text-white",
                failed && "border-destructive bg-destructive text-white",
                active && "border-primary text-primary",
                !done && !failed && !active && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : failed ? <X className="size-3.5" /> : active ? <Spinner className="size-3.5" /> : index + 1}
            </span>
            <div className="flex flex-col pt-0.5">
              <span className={cn("text-sm", (active || failed) && "font-medium", !done && !active && !failed && "text-muted-foreground")}>
                {label}
                <span className="sr-only">{done ? " (completed)" : active ? " (in progress)" : failed ? " (failed)" : ""}</span>
              </span>
              {failed && error ? <span className="text-sm text-destructive" role="alert">{error}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
