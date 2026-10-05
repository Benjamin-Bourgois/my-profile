"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatPrice } from "@/lib/format";
import { FINAL_STATUSES, type CustomerOrder, type OrderStatus } from "@/lib/order-types";

const POLL_INTERVAL = 4000;

const STATUS_TEXT: Record<OrderStatus, { icon: string; title: string; text: string }> = {
  pending_payment: { icon: "⏳", title: "Paiement en cours…", text: "Nous attendons la confirmation de votre paiement." },
  received: { icon: "📨", title: "Commande reçue", text: "Le bar a bien reçu votre commande." },
  preparing: { icon: "🍹", title: "En préparation", text: "Votre commande est en cours de préparation." },
  served: { icon: "✅", title: "Servie", text: "Bonne dégustation !" },
  cancelled: { icon: "✖️", title: "Commande annulée", text: "Demandez au serveur pour plus d'informations." },
};

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "received", label: "Reçue" },
  { status: "preparing", label: "En préparation" },
  { status: "served", label: "Servie" },
];

/** Suivi d'une commande, mis à jour automatiquement. */
export function OrderTracker({
  initialOrder,
  token,
  venueName,
  canReorder,
}: {
  initialOrder: CustomerOrder;
  token: string;
  venueName: string | null;
  canReorder: boolean;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [connectionLost, setConnectionLost] = useState(false);
  const finished = FINAL_STATUSES.includes(order.status);

  useEffect(() => {
    if (finished) return;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        setOrder(await response.json());
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

  const status = STATUS_TEXT[order.status];
  const stepIndex = STEPS.findIndex((step) => step.status === order.status);

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-12 pt-8">
      <p className="text-center text-stone-500">
        {venueName ? `${venueName} · ` : ""}
        {order.table_label}
      </p>
      <h1 className="mt-1 text-center text-4xl font-bold">Commande n° {order.order_number}</h1>

      <section
        aria-live="polite"
        className={`mt-6 rounded-3xl p-6 text-center ${
          order.status === "served"
            ? "bg-green-100 text-green-950"
            : order.status === "cancelled"
              ? "bg-stone-200 text-stone-800"
              : "bg-amber-100 text-amber-950"
        }`}
      >
        <p aria-hidden className="text-5xl">
          {status.icon}
        </p>
        <p className="mt-3 text-2xl font-bold">{status.title}</p>
        <p className="mt-1 text-lg">{status.text}</p>
      </section>

      {order.status !== "cancelled" && order.status !== "pending_payment" && (
        <ol className="mt-6 flex items-start justify-between" aria-label="Avancement">
          {STEPS.map((step, index) => {
            const done = index <= stepIndex;
            return (
              <li key={step.status} className="flex flex-1 flex-col items-center gap-2 text-center">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-full text-lg font-bold ${
                    done ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-500"
                  }`}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span className={`text-sm ${done ? "font-semibold text-stone-900" : "text-stone-500"}`}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <ul className="space-y-2">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span>
                <strong>{item.quantity} ×</strong> {item.name}
              </span>
              <span className="tabular-nums text-stone-600">{formatPrice(item.line_total_cents)}</span>
            </li>
          ))}
        </ul>
        {order.comment && <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2 text-stone-700">💬 {order.comment}</p>}
        <div className="mt-4 flex justify-between border-t border-stone-200 pt-3 text-lg font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(order.total_cents)}</span>
        </div>
        <p className="mt-2 text-stone-600">{paymentText(order)}</p>
      </section>

      {canReorder && (
        <Link
          href={`/t/${token}`}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-amber-400 text-lg font-bold text-stone-900 active:bg-amber-500"
        >
          Commander à nouveau
        </Link>
      )}

      <p className="mt-4 text-center text-sm text-stone-400">
        {finished ? "" : connectionLost ? "Connexion perdue, nouvel essai en cours…" : "Cette page se met à jour toute seule."}
      </p>
    </main>
  );
}

function paymentText(order: CustomerOrder): string {
  if (order.payment_status === "paid") return order.payment_method === "online" ? "✓ Payé en ligne" : "✓ Réglé";
  if (order.payment_method === "online") return "Paiement en attente de confirmation.";
  return "À régler auprès du serveur.";
}
