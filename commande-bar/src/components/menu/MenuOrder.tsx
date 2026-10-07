"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { CallButtons } from "@/components/menu/CallButtons";
import { CartSheet, type CartLine } from "@/components/menu/CartSheet";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { MenuHeader } from "@/components/menu/MenuHeader";
import { ProductRow } from "@/components/menu/ProductRow";
import { useCart, useRecentOrders } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import type { Menu } from "@/lib/menu";
import { GENERIC_ORDER_ERROR, MENU_CHANGED_CODES } from "@/lib/order-errors";
import { MAX_QUANTITY_PER_LINE, type PaymentMethod, type StaffPayment, type StaffPaymentOptions } from "@/lib/order-types";
import { pickSuggestions, useOrigins, type Suggestions } from "@/lib/suggestions";

const PAUSED_REFRESH_INTERVAL = 30_000;

/** Carte du bar avec panier et envoi de la commande. */
export function MenuOrder({
  menu,
  token,
  payment,
  suggestions,
  openCart = false,
}: {
  menu: Menu;
  token: string;
  payment: { staff: boolean; online: boolean; staffOptions: StaffPaymentOptions | null };
  suggestions: Suggestions | null;
  /** Ouvrir le panier dès l'arrivée (« Une autre tournée ? » depuis le suivi). */
  openCart?: boolean;
}) {
  const router = useRouter();
  const [cart, setCart] = useCart(token);
  const [origins, setOrigins] = useOrigins(token);
  const [recentOrders, setRecentOrders] = useRecentOrders(token);
  const [cartOpen, setCartOpen] = useState(openCart);

  // Panier ouvert depuis le suivi : on retire ?panier=1 pour qu'un rechargement ne le rouvre pas.
  useEffect(() => {
    if (openCart) router.replace(`/t/${token}`, { scroll: false });
  }, [openCart, router, token]);
  const paused = menu.venue.orders_paused;
  const orderingEnabled = !paused && (payment.staff || payment.online);

  // Commandes en pause : la carte se recharge toute seule pour voir la reprise.
  useEffect(() => {
    if (!paused) return;
    const timer = window.setInterval(() => router.refresh(), PAUSED_REFRESH_INTERVAL);
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [paused, router]);

  const products = useMemo(
    () => new Map(menu.categories.flatMap((category) => category.products).map((product) => [product.id, product])),
    [menu],
  );
  const categoryOf = useMemo(
    () => new Map(menu.categories.flatMap((category) => category.products.map((product) => [product.id, category.id] as const))),
    [menu],
  );

  // Seuls les produits encore disponibles comptent (la carte a pu changer).
  const lines: CartLine[] = useMemo(
    () =>
      Object.entries(cart).flatMap(([id, quantity]) => {
        const product = products.get(id);
        // Jamais plus que ce qu'il reste en stock
        return product?.is_available ? [{ product, quantity: Math.min(quantity, product.remaining ?? quantity) }] : [];
      }),
    [cart, products],
  );
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price_cents, 0);

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      setCart((current) => {
        const next = { ...current };
        if (quantity <= 0) delete next[productId];
        else next[productId] = Math.min(quantity, MAX_QUANTITY_PER_LINE);
        return next;
      });
      if (quantity <= 0) {
        setOrigins((current) => {
          if (!(productId in current)) return current;
          const next = { ...current };
          delete next[productId];
          return next;
        });
      }
    },
    [setCart, setOrigins],
  );

  // « Souvent pris avec » : l'article ajouté est compté comme vente de l'appli.
  const suggested = useMemo(
    () => pickSuggestions(lines.map((line) => line.product.id), suggestions, products, categoryOf),
    [lines, suggestions, products, categoryOf],
  );
  const addSuggestion = useCallback(
    (productId: string) => {
      setQuantity(productId, (cart[productId] ?? 0) + 1);
      setOrigins((current) => (current[productId] ? current : { ...current, [productId]: "pairing" }));
    },
    [cart, setQuantity, setOrigins],
  );

  const closeCart = useCallback(() => setCartOpen(false), []);

  async function sendOrder({
    comment,
    paymentMethod,
    staffPayment,
    tipCents,
  }: {
    comment: string;
    paymentMethod: PaymentMethod;
    staffPayment: StaffPayment | null;
    tipCents: number;
  }) {
    let response: Response;
    try {
      response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          items: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity, suggestion: origins[product.id] })),
          comment: comment.trim() || null,
          payment_method: paymentMethod,
          staff_payment: paymentMethod === "staff" ? staffPayment : null,
          tip_cents: tipCents,
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
    setOrigins(() => ({}));
    return null;
  }

  const lastOrder = recentOrders[0];

  return (
    <div className="min-h-dvh">
      <MenuHeader venue={menu.venue} tableLabel={menu.table.label} />

      <div className="mx-auto grid max-w-[680px] gap-3 px-4 pt-4">
        {lastOrder && (
          <Link
            href={`/t/${token}/commande/${lastOrder.id}`}
            className="card card--hover flex items-center justify-between gap-3 !py-3"
          >
            <span>
              <span className="eyebrow block">Votre commande</span>
              <span className="font-serif text-[22px] font-semibold">n° {lastOrder.number}</span>
            </span>
            <span className="btn btn--soft btn--sm">
              Suivre <Icon name="arrowRight" size={16} />
            </span>
          </Link>
        )}

        {paused && (
          <div role="status" className="flex gap-3 rounded-md border border-danger-soft bg-danger-soft px-4 py-3">
            <Icon name="pause" className="mt-0.5 text-danger" />
            <p className="text-ink-2">
              <strong className="text-danger">Commandes en pause.</strong> Le bar ne prend plus de commandes depuis le
              téléphone pour le moment. Vous pouvez consulter la carte ou appeler un serveur.
            </p>
          </div>
        )}

        <CallButtons token={token} />
      </div>

      <CategoryNav categories={menu.categories} />

      <main className={`mx-auto max-w-[680px] px-4 ${count > 0 ? "pb-32" : "pb-10"}`}>
        {menu.categories.length === 0 && (
          <p className="py-16 text-center text-ink-2">La carte est en cours de préparation.</p>
        )}
        {menu.categories.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-20 pt-6">
            <h2 className="mb-3 text-[30px]">{category.name}</h2>
            <ul className="grid gap-3">
              {category.products.map((product, index) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  category={category.name}
                  index={index}
                  quantity={cart[product.id] ?? 0}
                  orderingEnabled={orderingEnabled}
                  onChange={(quantity) => setQuantity(product.id, quantity)}
                />
              ))}
            </ul>
          </section>
        ))}

        <footer className="mt-10 border-t border-line pt-5 text-center text-[13px] text-muted">
          <p>La vente d&apos;alcool est interdite aux mineurs de moins de 18 ans.</p>
          <p>L&apos;abus d&apos;alcool est dangereux pour la santé, à consommer avec modération.</p>
        </footer>
      </main>

      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-[calc(16px+var(--safe-b))] z-20 px-4">
          <button
            key={count}
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-[60px] w-full max-w-[648px] animate-[bump_.3s_var(--ease)] items-center justify-between gap-3 rounded-full bg-matte pl-2.5 pr-2.5 text-white shadow-float transition-colors hover:bg-matte-hover"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 min-w-10 place-items-center rounded-full bg-gold px-2 text-[15px] font-bold text-matte">
                {count}
              </span>
              <span className="text-[15px] font-semibold">Voir mon panier</span>
            </span>
            <span className="rounded-full bg-white/12 px-4 py-2 text-[15px] font-bold tabular-nums">{formatPrice(total)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <CartSheet
          tableLabel={menu.table.label}
          lines={lines}
          total={total}
          payment={payment}
          paused={paused}
          suggestions={suggested}
          onAddSuggestion={addSuggestion}
          onClose={closeCart}
          onChangeQuantity={setQuantity}
          onSubmit={sendOrder}
        />
      )}
    </div>
  );
}
