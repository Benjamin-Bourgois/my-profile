"use client";

import { formatPrice, formatTime } from "@/lib/format";
import { paymentLabel, type BarOrder, type OrderStatus } from "@/lib/order-types";

/** Au-delà de ces durées d'attente, la commande change de couleur. */
export const WAIT_WARNING_MINUTES = 5;
export const WAIT_ALERT_MINUTES = 10;

export type OrderActions = {
  onStatus: (order: BarOrder, status: OrderStatus) => void;
  onPaid: (order: BarOrder) => void;
  onCancel: (order: BarOrder) => void;
};

export function PaymentBadge({ order }: { order: BarOrder }) {
  const paid = order.payment_status === "paid";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-base font-bold ${
        paid ? "bg-green-100 text-green-900" : "bg-amber-200 text-amber-950"
      }`}
    >
      {paid ? "✓ " : "€ "}
      {paymentLabel(order)}
      {!paid && order.payment_method === "staff" ? ` · ${formatPrice(order.total_cents)}` : ""}
    </span>
  );
}

const canCollect = (order: BarOrder) =>
  order.payment_method === "staff" && order.payment_status === "unpaid" && order.status !== "cancelled";

/** Commande à préparer, sur l'écran du bar. */
export function OrderCard({
  order,
  waitMinutes,
  busy,
  timeZone,
  actions,
}: {
  order: BarOrder;
  waitMinutes: number;
  busy: boolean;
  timeZone: string;
  actions: OrderActions;
}) {
  const level = waitMinutes >= WAIT_ALERT_MINUTES ? "alert" : waitMinutes >= WAIT_WARNING_MINUTES ? "warning" : "ok";
  const isNew = order.status === "received";

  return (
    <article
      className={`flex flex-col rounded-3xl p-5 shadow-sm ${
        level === "alert"
          ? "bg-red-50 ring-4 ring-red-500"
          : level === "warning"
            ? "bg-orange-50 ring-4 ring-orange-400"
            : isNew
              ? "bg-white ring-4 ring-sky-400"
              : "bg-white ring-1 ring-stone-200"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 break-words text-5xl font-black leading-none tracking-tight">{order.table_label}</h2>
        <p className="shrink-0 text-2xl font-bold">n° {order.order_number}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`whitespace-nowrap rounded-full px-3 py-0.5 text-sm font-bold uppercase ${
            isNew ? "bg-sky-500 text-white" : "bg-amber-400 text-stone-900"
          }`}
        >
          {isNew ? "Nouvelle" : "En préparation"}
        </span>
        <span className="text-lg text-stone-600">
          Reçue à {formatTime(order.received_at, timeZone)} ·{" "}
          <span className={level === "ok" ? "" : "font-bold text-red-700"}>
            {waitMinutes < 1 ? "à l'instant" : `il y a ${waitMinutes} min`}
          </span>
        </span>
      </div>
      <div className="mt-2">
        <PaymentBadge order={order} />
      </div>

      <ul className="mt-4 space-y-1 text-2xl">
        {order.items.map((item, index) => (
          <li key={index}>
            <strong>{item.quantity} ×</strong> {item.name}
          </li>
        ))}
      </ul>
      {order.comment && (
        <p className="mt-3 rounded-xl bg-yellow-200 px-4 py-2 text-xl font-semibold text-yellow-950">💬 {order.comment}</p>
      )}

      <div className="mt-auto grid gap-2 pt-5">
        {order.status === "received" ? (
          <BigButton disabled={busy} onClick={() => actions.onStatus(order, "preparing")} className="bg-amber-400 text-stone-900">
            En préparation
          </BigButton>
        ) : (
          <BigButton disabled={busy} onClick={() => actions.onStatus(order, "served")} className="bg-green-600 text-white">
            ✓ Servie
          </BigButton>
        )}
        <div className="flex flex-wrap gap-2">
          {order.status === "received" && (
            <SmallButton disabled={busy} onClick={() => actions.onStatus(order, "served")}>
              Servie directement
            </SmallButton>
          )}
          {order.status === "preparing" && (
            <SmallButton disabled={busy} onClick={() => actions.onStatus(order, "received")}>
              ↩ Remettre en « Nouvelle »
            </SmallButton>
          )}
          {canCollect(order) && (
            <SmallButton disabled={busy} onClick={() => actions.onPaid(order)}>
              € Encaissé
            </SmallButton>
          )}
          {canCollect(order) && (
            <SmallButton disabled={busy} onClick={() => actions.onCancel(order)}>
              Annuler
            </SmallButton>
          )}
        </div>
      </div>
    </article>
  );
}

/** Commande servie ou annulée, dans l'historique. */
export function HistoryRow({
  order,
  busy,
  timeZone,
  actions,
}: {
  order: BarOrder;
  busy: boolean;
  timeZone: string;
  actions: OrderActions;
}) {
  const served = order.status === "served";
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200 ${served ? "" : "opacity-60"}`}>
      <span className="text-2xl font-black">{order.table_label}</span>
      <span className="text-lg font-semibold text-stone-500">n° {order.order_number}</span>
      <span className="min-w-48 flex-1 text-lg">
        {order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}
      </span>
      <span className="text-stone-600">
        {served ? `Servie à ${formatTime(order.served_at, timeZone)}` : `Annulée à ${formatTime(order.cancelled_at, timeZone)}`}
      </span>
      {served && <PaymentBadge order={order} />}
      {canCollect(order) && (
        <SmallButton disabled={busy} onClick={() => actions.onPaid(order)}>
          € Encaissé
        </SmallButton>
      )}
      {served && (
        <SmallButton disabled={busy} onClick={() => actions.onStatus(order, "preparing")}>
          ↩ Remettre en préparation
        </SmallButton>
      )}
    </li>
  );
}

function BigButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`h-16 rounded-2xl text-2xl font-bold active:scale-[0.98] disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function SmallButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-12 rounded-xl bg-stone-200 px-4 text-base font-semibold text-stone-800 active:bg-stone-300 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
