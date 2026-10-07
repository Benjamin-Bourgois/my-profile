"use client";

import { Icon } from "@/components/Icon";
import { MAX_QUANTITY_PER_LINE } from "@/lib/order-types";

/** [−] 2 [+] : boutons ronds de 40 px, faciles à toucher. */
export function QuantityStepper({
  quantity,
  label,
  onChange,
  max = MAX_QUANTITY_PER_LINE,
}: {
  quantity: number;
  label: string;
  onChange: (quantity: number) => void;
  /** Au plus 20 par ligne, ou ce qu'il reste en stock. */
  max?: number;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-sand-2 p-1">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity === 1 ? `Retirer ${label}` : `Un ${label} de moins`}
        className="icon-btn"
      >
        <Icon name={quantity === 1 ? "trash" : "minus"} size={16} />
      </button>
      <span className="min-w-7 text-center text-[15px] font-bold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= max}
        aria-label={`Un ${label} de plus`}
        className="icon-btn"
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
