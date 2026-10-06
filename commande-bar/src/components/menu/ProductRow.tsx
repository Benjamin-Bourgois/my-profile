"use client";

import { Icon } from "@/components/Icon";
import { formatPrice } from "@/lib/format";
import type { MenuProduct } from "@/lib/menu";
import { MAX_QUANTITY_PER_LINE } from "@/lib/order-types";
import { productEmoji, riseStyle } from "@/lib/style";

/** Carte « plat » : texte à gauche, photo carrée à droite avec le bouton « + ». */
export function ProductRow({
  product,
  category,
  index,
  quantity,
  orderingEnabled,
  onChange,
}: {
  product: MenuProduct;
  category: string;
  index: number;
  quantity: number;
  orderingEnabled: boolean;
  onChange: (quantity: number) => void;
}) {
  const canOrder = orderingEnabled && product.is_available;

  return (
    <li className={`card rise flex gap-3 ${product.is_available ? "" : "opacity-60"}`} style={riseStyle(index)}>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[21px]">{product.name}</h3>
        {product.description && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{product.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <span className="text-[15px] font-bold tabular-nums">{formatPrice(product.price_cents)}</span>
          {!product.is_available && <span className="badge badge--danger">Épuisé</span>}
          {quantity > 0 && product.is_available && <span className="badge badge--gold">{quantity} au panier</span>}
        </div>
      </div>

      <div className="relative h-[112px] w-[112px] shrink-0">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            className={`h-full w-full rounded-[12px] bg-sand-2 object-cover ${product.is_available ? "" : "grayscale"}`}
          />
        ) : (
          <div aria-hidden className="photo-placeholder h-full w-full rounded-[12px]">
            {productEmoji(product.name, category)}
          </div>
        )}

        {canOrder &&
          (quantity > 0 ? (
            <div className="absolute inset-x-1.5 bottom-1.5 flex h-[34px] items-center justify-between rounded-full bg-matte px-0.5 text-white shadow-float">
              <button
                type="button"
                onClick={() => onChange(quantity - 1)}
                aria-label={quantity === 1 ? `Retirer ${product.name}` : `Un ${product.name} de moins`}
                className="grid h-[30px] w-[30px] place-items-center rounded-full active:bg-white/15"
              >
                <Icon name="minus" size={16} />
              </button>
              <span className="text-[14px] font-bold tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => onChange(quantity + 1)}
                disabled={quantity >= MAX_QUANTITY_PER_LINE}
                aria-label={`Un ${product.name} de plus`}
                className="grid h-[30px] w-[30px] place-items-center rounded-full active:bg-white/15 disabled:opacity-40"
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onChange(1)}
              aria-label={`Ajouter ${product.name}`}
              className="absolute bottom-1.5 right-1.5 grid h-[34px] w-[34px] place-items-center rounded-full bg-matte text-white shadow-float transition-transform duration-150 ease-chic hover:bg-matte-hover active:scale-90"
            >
              <Icon name="plus" size={18} />
            </button>
          ))}
      </div>
    </li>
  );
}
