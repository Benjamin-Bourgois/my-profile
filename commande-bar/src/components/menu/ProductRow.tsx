"use client";

import { QuantityStepper } from "@/components/menu/QuantityStepper";
import { formatPrice } from "@/lib/format";
import type { MenuProduct } from "@/lib/menu";

export function ProductRow({
  product,
  quantity,
  orderingEnabled,
  onChange,
}: {
  product: MenuProduct;
  quantity: number;
  orderingEnabled: boolean;
  onChange: (quantity: number) => void;
}) {
  const canOrder = orderingEnabled && product.is_available;

  return (
    <li className={`flex gap-4 p-4 ${product.is_available ? "" : "opacity-50"}`}>
      {product.image_url && (
        <img
          src={product.image_url}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl bg-stone-100 object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug text-stone-900">{product.name}</h3>
          <span className="shrink-0 text-lg font-semibold tabular-nums text-stone-900">
            {formatPrice(product.price_cents)}
          </span>
        </div>
        {product.description && <p className="mt-1 text-stone-500">{product.description}</p>}
        {!product.is_available && (
          <p className="mt-2 inline-block rounded-full bg-stone-200 px-2.5 py-0.5 text-sm font-semibold text-stone-700">
            Indisponible
          </p>
        )}
        {canOrder && (
          <div className="mt-3 flex justify-end">
            {quantity > 0 ? (
              <QuantityStepper quantity={quantity} label={product.name} onChange={onChange} />
            ) : (
              <button
                type="button"
                onClick={() => onChange(1)}
                aria-label={`Ajouter ${product.name}`}
                className="h-11 rounded-full bg-amber-400 px-5 text-base font-bold text-stone-900 active:bg-amber-500"
              >
                + Ajouter
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
