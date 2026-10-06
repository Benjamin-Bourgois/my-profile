"use client";

import { Icon } from "@/components/Icon";
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
    <span className={`badge badge--lg ${paid ? "badge--ok" : "badge--warn"}`}>
      <Icon name={paid ? "check" : "card"} size={13} />
      {paymentLabel(order)}
      {!paid && order.payment_method === "staff" ? ` · ${formatPrice(order.total_cents)}` : ""}
    </span>
  );
}

/** Pourboire laissé avec le paiement en ligne. */
export function TipBadge({ order }: { order: BarOrder }) {
  if (order.tip_cents <= 0 || order.payment_status !== "paid") return null;
  return (
    <span className="badge badge--lg badge--gold">
      <Icon name="heart" size={13} />
      Pourboire {formatPrice(order.tip_cents)}
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
      className={`card flex flex-col !p-5 ${
        level === "alert" ? "!border-danger" : level === "warning" ? "!border-warn" : ""
      } ${isNew ? "animate-[arrive_.35s_var(--ease),halo_2.2s_var(--ease)_.4s_infinite]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Commande n° {order.order_number}</p>
          <h2 className="mt-1 break-words text-[52px] leading-none">{order.table_label}</h2>
        </div>
        <span className={`badge badge--lg shrink-0 ${isNew ? "badge--dark" : "badge--warn"}`}>
          {isNew ? "Nouvelle" : "En préparation"}
        </span>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-ink-2">
        <Icon name="clock" size={16} />
        Reçue à {formatTime(order.received_at, timeZone)} ·
        <span className={level === "alert" ? "font-bold text-danger" : level === "warning" ? "font-bold text-warn-ink" : ""}>
          {waitMinutes < 1 ? "à l'instant" : `il y a ${waitMinutes} min`}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PaymentBadge order={order} />
        <TipBadge order={order} />
      </div>

      <ul className="mt-4 space-y-1 text-[20px] leading-snug">
        {order.items.map((item, index) => (
          <li key={index}>
            <strong className="tabular-nums">{item.quantity} ×</strong> {item.name}
          </li>
        ))}
      </ul>
      {order.comment && (
        <p className="mt-3 flex gap-2 rounded-sm bg-warn-soft px-3 py-2 text-[17px] font-semibold text-warn-ink">
          <Icon name="comment" className="mt-1" /> {order.comment}
        </p>
      )}

      <div className="mt-auto grid gap-2 pt-5">
        {order.status === "received" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => actions.onStatus(order, "preparing")}
            className="btn btn--primary btn--block min-h-14 text-[17px]"
          >
            En préparation
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => actions.onStatus(order, "served")}
            className="btn btn--primary btn--block min-h-14 text-[17px]"
          >
            <Icon name="check" />
            Servie
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {order.status === "received" && (
            <SmallButton disabled={busy} onClick={() => actions.onStatus(order, "served")}>
              Servie directement
            </SmallButton>
          )}
          {order.status === "preparing" && (
            <SmallButton disabled={busy} onClick={() => actions.onStatus(order, "received")}>
              <Icon name="undo" size={15} />
              Remettre en « Nouvelle »
            </SmallButton>
          )}
          {canCollect(order) && (
            <SmallButton disabled={busy} onClick={() => actions.onPaid(order)}>
              Encaissé
            </SmallButton>
          )}
          {canCollect(order) && (
            <SmallButton disabled={busy} danger onClick={() => actions.onCancel(order)}>
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
    <li className={`card flex flex-wrap items-center gap-x-4 gap-y-2 ${served ? "" : "opacity-60"}`}>
      <span className="font-serif text-[26px] font-semibold leading-none">{order.table_label}</span>
      <span className="eyebrow">n° {order.order_number}</span>
      <span className="min-w-48 flex-1">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</span>
      <span className="text-[13px] text-ink-2">
        {served ? `Servie à ${formatTime(order.served_at, timeZone)}` : `Annulée à ${formatTime(order.cancelled_at, timeZone)}`}
      </span>
      {served && <PaymentBadge order={order} />}
      {served && <TipBadge order={order} />}
      {canCollect(order) && (
        <SmallButton disabled={busy} onClick={() => actions.onPaid(order)}>
          Encaissé
        </SmallButton>
      )}
      {served && (
        <SmallButton disabled={busy} onClick={() => actions.onStatus(order, "preparing")}>
          <Icon name="undo" size={15} />
          Remettre en préparation
        </SmallButton>
      )}
    </li>
  );
}

function SmallButton({ children, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button type="button" {...props} className={`btn min-h-11 !px-4 !text-[14px] ${danger ? "btn--danger" : "btn--ghost"}`}>
      {children}
    </button>
  );
}
