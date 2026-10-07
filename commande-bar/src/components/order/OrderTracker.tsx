"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import { CallButtons } from "@/components/menu/CallButtons";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { FINAL_STATUSES, type CustomerOrder, type OrderStatus } from "@/lib/order-types";
import { REORDER_DELAY_MS, useOrigins, type ReorderOffer } from "@/lib/suggestions";

const POLL_INTERVAL = 3000;
/** Au-delà, on prévient le client que la confirmation du paiement tarde. */
const SLOW_PAYMENT_CONFIRMATION = 45_000;

export type PaymentReturn = "ok" | "annule" | null;

type StatusText = { icon: IconName; tone: "ok" | "warn" | "neutral" | "dark"; title: string; text: string };

const STATUS_TEXT: Record<OrderStatus, StatusText> = {
  pending_payment: { icon: "clock", tone: "warn", title: "Paiement en cours…", text: "Nous attendons la confirmation de votre paiement." },
  received: { icon: "check", tone: "dark", title: "Commande reçue", text: "Le bar a bien reçu votre commande." },
  preparing: { icon: "glass", tone: "dark", title: "En préparation", text: "Votre commande est en cours de préparation." },
  served: { icon: "check", tone: "ok", title: "Servie", text: "Bonne dégustation !" },
  cancelled: { icon: "close", tone: "neutral", title: "Commande annulée", text: "Demandez au serveur pour plus d'informations." },
};

const TONE_CLASS: Record<StatusText["tone"], string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn-ink",
  neutral: "bg-sand-2 text-ink-2",
  dark: "bg-matte text-white",
};

const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "received", label: "Reçue", hint: "Transmise au bar" },
  { status: "preparing", label: "En préparation", hint: "Le bar s'en occupe" },
  { status: "served", label: "Servie", hint: "Apportée à votre table" },
];

/** Suivi d'une commande, mis à jour automatiquement. */
export function OrderTracker({
  initialOrder,
  token,
  venueName,
  canReorder,
  reorderOffer,
  paymentReturn,
}: {
  initialOrder: CustomerOrder;
  token: string;
  venueName: string | null;
  canReorder: boolean;
  /** « Une autre tournée ? » (null : suggestions désactivées par le bar) */
  reorderOffer: ReorderOffer | null;
  /** Retour depuis la page de paiement Stripe (?paiement=ok ou ?paiement=annule). */
  paymentReturn: PaymentReturn;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, setCart] = useCart(token);
  const [, setOrigins] = useOrigins(token);
  const [order, setOrder] = useState(initialOrder);
  // Servie : à quel moment (donné par le bar, sinon constaté par cette page)
  const [servedAt, setServedAt] = useState<number | null>(() =>
    reorderOffer?.served_at ? Date.parse(reorderOffer.served_at) : initialOrder.status === "served" ? Date.now() : null,
  );
  const [offerReady, setOfferReady] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [slowPayment, setSlowPayment] = useState(false);
  const finished = FINAL_STATUSES.includes(order.status);
  const paymentCancelled = order.status === "pending_payment" && paymentReturn === "annule";

  // Retour de Stripe après un paiement réussi : le panier est payé, on le vide.
  useEffect(() => {
    if (paymentReturn !== "ok") return;
    setCart(() => ({}));
    setOrigins(() => ({}));
    router.replace(pathname, { scroll: false });
  }, [paymentReturn, pathname, router, setCart, setOrigins]);

  // « Une autre tournée ? » : proposée un quart d'heure après le service.
  useEffect(() => {
    if (servedAt === null || !reorderOffer?.items.length) return;
    const timer = window.setTimeout(() => setOfferReady(true), Math.max(0, servedAt + REORDER_DELAY_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [servedAt, reorderOffer]);

  function reorderSame() {
    if (!reorderOffer) return;
    setCart((current) => {
      const next = { ...current };
      for (const item of reorderOffer.items) next[item.product_id] = (next[item.product_id] ?? 0) + item.quantity;
      return next;
    });
    setOrigins((current) => {
      const next = { ...current };
      for (const item of reorderOffer.items) next[item.product_id] ??= "reorder";
      return next;
    });
    router.push(`/t/${token}?panier=1`);
  }

  // Confirmation du paiement anormalement longue (webhook Stripe en retard).
  useEffect(() => {
    if (order.status !== "pending_payment" || paymentCancelled) return;
    const timer = window.setTimeout(() => setSlowPayment(true), SLOW_PAYMENT_CONFIRMATION);
    return () => window.clearTimeout(timer);
  }, [order.status, paymentCancelled]);

  useEffect(() => {
    if (finished) return;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as CustomerOrder;
        setOrder(next);
        if (next.status === "served") setServedAt((current) => current ?? Date.now());
        setConnectionLost(false);
      } catch {
        setConnectionLost(true);
      }
    };
    const timer = window.setInterval(refresh, POLL_INTERVAL);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [finished, order.id, token]);

  const status = paymentCancelled
    ? ({ icon: "undo", tone: "warn", title: "Paiement annulé", text: "Votre commande n'a pas été envoyée au bar. Votre panier est conservé." } satisfies StatusText)
    : order.status === "cancelled" && order.payment_method === "online" && order.payment_status === "unpaid"
      ? ({ icon: "close", tone: "neutral", title: "Paiement non finalisé", text: "La commande n'a pas été envoyée au bar." } satisfies StatusText)
      : STATUS_TEXT[order.status];
  const stepIndex = STEPS.findIndex((step) => step.status === order.status);

  const payment = paymentState(order, paymentCancelled);

  return (
    <main className="mx-auto min-h-dvh max-w-[680px] px-4 pb-12 pt-8">
      <p className="eyebrow text-center">
        {venueName ? `${venueName} · ` : ""}
        {order.table_label}
      </p>
      <h1 className="mt-1 text-center text-[34px]">Commande n° {order.order_number}</h1>

      <section aria-live="polite" className="card mt-6 flex items-center gap-4 !p-5">
        <span aria-hidden className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${TONE_CLASS[status.tone]}`}>
          <Icon name={status.icon} size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-serif text-[26px] font-semibold leading-tight">{status.title}</p>
          <p className="text-ink-2">{status.text}</p>
          {slowPayment && order.status === "pending_payment" && (
            <p className="mt-2 text-[14px] text-warn-ink">
              La confirmation prend plus de temps que prévu. Si rien ne change d&apos;ici une minute, montrez cet écran au serveur.
            </p>
          )}
        </div>
      </section>

      {canReorder && offerReady && order.status === "served" && reorderOffer && reorderOffer.items.length > 0 && (
        <section aria-labelledby="autre-tournee" className="card rise mt-3 !border-gold !p-5">
          <p className="eyebrow">Une autre tournée ?</p>
          <h2 id="autre-tournee" className="mt-1 text-[26px] leading-tight">
            La même chose, en un geste
          </h2>
          <p className="mt-1 text-ink-2">
            {reorderOffer.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}
          </p>
          <button type="button" onClick={reorderSame} className="btn btn--primary btn--block mt-4">
            <Icon name="glass" size={18} />
            Reprendre la même chose ·{" "}
            {formatPrice(reorderOffer.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0))}
          </button>
          <p className="mt-2 text-center text-[13px] text-muted">Vous vérifiez votre panier avant d&apos;envoyer.</p>
        </section>
      )}

      {order.status !== "cancelled" && order.status !== "pending_payment" && (
        <ol className="card mt-3 !px-5 !py-4" aria-label="Avancement">
          {STEPS.map((step, index) => {
            const done = index <= stepIndex;
            const current = index === stepIndex && order.status !== "served";
            return (
              <li key={step.status} className="relative flex gap-3 pb-4 last:pb-0">
                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute bottom-0 left-[13px] top-7 w-0.5 ${index < stepIndex ? "bg-matte" : "bg-sand-3"}`}
                  />
                )}
                <span
                  className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                    done ? "bg-matte text-white" : "border border-line bg-sand-2 text-muted"
                  } ${current ? "animate-[breathe_2.4s_var(--ease)_infinite]" : ""}`}
                >
                  {done ? <Icon name="check" size={14} /> : index + 1}
                </span>
                <div className="pt-0.5">
                  <p className={done ? "font-semibold" : "text-muted"}>{step.label}</p>
                  <p className="text-[13px] text-ink-2">{step.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="card mt-3 !p-5">
        <ul className="space-y-2">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span>
                <strong className="tabular-nums">{item.quantity} ×</strong> {item.name}
              </span>
              <span className="tabular-nums text-ink-2">{formatPrice(item.line_total_cents)}</span>
            </li>
          ))}
        </ul>
        {order.comment && (
          <p className="mt-3 flex gap-2 rounded-sm bg-sand-2 px-3 py-2 text-ink-2">
            <Icon name="comment" className="mt-0.5" /> {order.comment}
          </p>
        )}
        {order.tip_cents > 0 && (
          <div className="mt-3 flex justify-between gap-3 text-ink-2">
            <span>Pourboire</span>
            <span className="tabular-nums">{formatPrice(order.tip_cents)}</span>
          </div>
        )}
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-semibold">Total</span>
          <span className="text-[17px] font-bold tabular-nums">{formatPrice(order.total_cents + order.tip_cents)}</span>
        </div>
        <p className="mt-3">
          <span className={`badge ${payment.className}`}>
            {payment.paid && <Icon name="check" size={12} />}
            {payment.label}
          </span>
        </p>
      </section>

      {canReorder && !paymentCancelled && order.status !== "pending_payment" && (
        <div className="mt-6">
          <CallButtons token={token} />
        </div>
      )}

      {canReorder && (
        <Link
          href={`/t/${token}`}
          className={`btn btn--block mt-4 ${offerReady && reorderOffer?.items.length && order.status === "served" ? "btn--ghost" : "btn--primary"}`}
        >
          {paymentCancelled || order.status === "cancelled" ? "Retour à la carte" : "Commander à nouveau"}
        </Link>
      )}

      <p className="mt-4 text-center text-[13px] text-muted">
        {finished ? "" : connectionLost ? "Connexion perdue, nouvel essai en cours…" : "Cette page se met à jour toute seule."}
      </p>
    </main>
  );
}

function paymentState(order: CustomerOrder, paymentCancelled: boolean): { label: string; className: string; paid: boolean } {
  if (order.payment_status === "paid") {
    return { label: order.payment_method === "online" ? "Payé en ligne" : "Réglé", className: "badge--ok", paid: true };
  }
  if (paymentCancelled || order.status === "cancelled") return { label: "Non payé", className: "", paid: false };
  if (order.payment_method === "online") return { label: "Paiement en attente", className: "badge--warn", paid: false };
  return { label: "À régler auprès du serveur", className: "badge--warn", paid: false };
}
