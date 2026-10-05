"use client";

import { Button } from "@lootvault/web-shared/ui";
import { Minus, Plus } from "lucide-react";

export function QuantityPicker({ value, max, onChange, disabled }: { value: number; max: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-card">
      <Button variant="ghost" size="icon" aria-label="Fewer" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>
        <Minus />
      </Button>
      <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button variant="ghost" size="icon" aria-label="More" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <Plus />
      </Button>
    </div>
  );
}
