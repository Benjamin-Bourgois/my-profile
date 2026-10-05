"use client";

import { MAX_QUANTITY_PER_LINE } from "@/lib/order-types";

/** [−] 2 [+] : gros boutons, faciles à toucher. */
export function QuantityStepper({
  quantity,
  label,
  onChange,
}: {
  quantity: number;
  label: string;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-stone-100 p-1">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity === 1 ? `Retirer ${label}` : `Un ${label} de moins`}
        className="grid h-11 w-11 place-items-center rounded-full bg-white text-2xl font-semibold text-stone-900 shadow-sm active:bg-stone-200"
      >
        −
      </button>
      <span className="min-w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_QUANTITY_PER_LINE}
        aria-label={`Un ${label} de plus`}
        className="grid h-11 w-11 place-items-center rounded-full bg-white text-2xl font-semibold text-stone-900 shadow-sm active:bg-stone-200 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
