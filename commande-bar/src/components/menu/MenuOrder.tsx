"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { CartSheet, type CartLine } from "@/components/menu/CartSheet";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { MenuHeader } from "@/components/menu/MenuHeader";
import { ProductRow } from "@/components/menu/ProductRow";
import { useCart, useRecentOrders } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import type { Menu } from "@/lib/menu";
import { GENERIC_ORDER_ERROR, MENU_CHANGED_CODES } from "@/lib/order-errors";
import { MAX_QUANTITY_PER_LINE, type PaymentMethod } from "@/lib/order-types";

/** Carte du bar avec panier et envoi de la commande. */
export function MenuOrder({
  menu,
  token,
  payment,
}: {
  menu: Menu;
  token: string;
  payment: { staff: boolean; online: boolean };
}) {
  const router = useRouter();
  const [cart, setCart] = useCart(token);
  const [recentOrders, setRecentOrders] = useRecentOrders(token);
  const [cartOpen, setCartOpen] = useState(false);
  const orderingEnabled = payment.staff || payment.online;

  const products = useMemo(
    () => new Map(menu.categories.flatMap((category) => category.products).map((product) => [product.id, product])),
    [menu],
  );

  // Seuls les produits encore disponibles comptent (la carte a pu changer).
  const lines: CartLine[] = useMemo(
    () =>
      Object.entries(cart).flatMap(([id, quantity]) => {
        const product = products.get(id);
        return product?.is_available ? [{ product, quantity }] : [];
      }),
    [cart, products],
  );
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price_cents, 0);

  const setQuantity = useCallback(
    (productId: string, quantity: number) =>
      setCart((current) => {
        const next = { ...current };
        if (quantity <= 0) delete next[productId];
        else next[productId] = Math.min(quantity, MAX_QUANTITY_PER_LINE);
        return next;
      }),
    [setCart],
  );

  const closeCart = useCallback(() => setCartOpen(false), []);

  async function sendOrder({ comment, paymentMethod }: { comment: string; paymentMethod: PaymentMethod }) {
    let response: Response;
    try {
      response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          items: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
          comment: comment.trim() || null,
          payment_method: paymentMethod,
        }),
      });
    } catch {
      return "Pas de connexion. Vérifiez votre réseau et réessayez.";
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (MENU_CHANGED_CODES.includes(body.code)) router.refresh();
      return typeof body.error === "string" ? body.error : GENERIC_ORDER_ERROR;
    }

    setRecentOrders((current) => [{ id: body.id, number: body.order_number, at: Date.now() }, ...current].slice(0, 5));
    if (typeof body.checkout_url === "string") {
      // Paiement en ligne : page sécurisée de Stripe. Le panier est gardé
      // jusqu'au paiement (le client peut annuler et revenir).
      window.location.assign(body.checkout_url);
      return null;
    }
    router.push(`/t/${token}/commande/${body.id}`);
    setCart(() => ({}));
    return null;
  }

  const lastOrder = recentOrders[0];

  return (
    <div className="min-h-dvh">
      <MenuHeader venue={menu.venue} tableLabel={menu.table.label} />

      {lastOrder && (
        <Link
          href={`/t/${token}/commande/${lastOrder.id}`}
          className="block bg-amber-100 px-4 py-3 text-amber-950 active:bg-amber-200"
        >
          <span className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <span>
              Votre commande <strong>n° {lastOrder.number}</strong>
            </span>
            <span className="font-semibold underline">Suivre →</span>
          </span>
        </Link>
      )}

      <CategoryNav categories={menu.categories} />

      <main className={`mx-auto max-w-xl px-4 ${count > 0 ? "pb-32" : "pb-16"}`}>
        {menu.categories.length === 0 && (
          <p className="py-16 text-center text-lg text-stone-500">La carte est en cours de préparation.</p>
        )}
        {menu.categories.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-20 pt-6">
            <h2 className="mb-3 text-xl font-bold text-stone-900">{category.name}</h2>
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
              {category.products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  quantity={cart[product.id] ?? 0}
                  orderingEnabled={orderingEnabled}
                  onChange={(quantity) => setQuantity(product.id, quantity)}
                />
              ))}
            </ul>
          </section>
        ))}
      </main>

      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-stone-50 via-stone-50/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-16 w-full max-w-xl items-center justify-between rounded-2xl bg-stone-900 px-5 text-lg font-bold text-white shadow-lg active:bg-stone-700"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-amber-400 px-2 text-base text-stone-900">
                {count}
              </span>
              Voir mon panier
            </span>
            <span className="tabular-nums">{formatPrice(total)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <CartSheet
          tableLabel={menu.table.label}
          lines={lines}
          total={total}
          payment={payment}
          onClose={closeCart}
          onChangeQuantity={setQuantity}
          onSubmit={sendOrder}
        />
      )}
    </div>
  );
}
