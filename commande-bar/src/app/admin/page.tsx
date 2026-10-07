import Link from "next/link";

import { AppSalesBanner } from "@/components/admin/AppSalesCard";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
import { requireOwnerVenue } from "@/lib/admin";
import type { DayData } from "@/lib/admin-types";
import { adminErrorMessage } from "@/lib/admin-errors";
import type { AppSales } from "@/lib/app-sales";
import { formatPrice, formatTime } from "@/lib/format";
import { paymentLabel, STAFF_PAYMENT_LABEL, type OrderStatus, type StaffPayment } from "@/lib/order-types";
import { getServerClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<OrderStatus, { label: string; className: string }> = {
  pending_payment: { label: "Paiement en cours", className: "badge--warn" },
  received: { label: "Reçue", className: "badge--dark" },
  preparing: { label: "En préparation", className: "badge--warn" },
  served: { label: "Servie", className: "badge--ok" },
  cancelled: { label: "Annulée", className: "badge--danger" },
};

/** « 2026-10-06 » ± n jours */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export default async function AdminDayPage(props: PageProps<"/admin">) {
  const venue = await requireOwnerVenue();
  const { jour } = await props.searchParams;
  const date = typeof jour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;

  const supabase = await getServerClient();
  const [{ data, error }, { data: appSales }] = await Promise.all([
    supabase.rpc("admin_get_day", { p_venue_id: venue.id, p_date: date }),
    supabase.rpc("admin_get_app_sales", { p_venue_id: venue.id, p_from: null, p_to: null }),
  ]);
  if (error) return <ErreurTechnique hint={adminErrorMessage(error)} />;
  const day = data as DayData;
  const isToday = day.business_date === day.today;
  // Règlements au serveur du jour : espèces, carte, les deux (pour la caisse)
  const staffOrders = day.orders.filter((o) => o.payment_method === "staff" && o.status !== "cancelled");
  const byKind = (kind: StaffPayment | null) =>
    staffOrders.filter((o) => (o.staff_payment ?? null) === kind).reduce((sum, o) => sum + o.total_cents, 0);
  const staffSplit = ([...(Object.keys(STAFF_PAYMENT_LABEL) as StaffPayment[]), null] as const)
    .map((kind) => ({ label: kind ? STAFF_PAYMENT_LABEL[kind] : "non précisé", cents: byKind(kind) }))
    .filter((part) => part.cents > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <p className="eyebrow first-letter:uppercase">{formatDay(day.business_date)}</p>
          <h2 className="text-[30px]">{isToday ? "Commandes du jour" : "Commandes"}</h2>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/admin?jour=${shiftDate(day.business_date, -1)}`} className="btn btn--ghost btn--sm">
            <Icon name="arrowLeft" size={16} />
            Jour précédent
          </Link>
          {!isToday && (
            <Link href="/admin" className="btn btn--ghost btn--sm">
              Aujourd&apos;hui
            </Link>
          )}
          <Link href={isToday ? "/admin" : `/admin?jour=${day.business_date}`} className="btn btn--soft btn--sm">
            <Icon name="refresh" size={16} />
            Actualiser
          </Link>
        </div>
      </div>

      {isToday && appSales && <AppSalesBanner monthCents={(appSales as AppSales).month_cents} />}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" aria-label="Totaux">
        <Tile label="Chiffre d'affaires" value={formatPrice(day.totals.revenue_cents)} note="hors pourboires" />
        <Tile label="Commandes" value={String(day.totals.count)} note={day.totals.cancelled_count ? `${day.totals.cancelled_count} annulée(s)` : undefined} />
        <Tile label="Payé en ligne" value={formatPrice(day.totals.online_cents)} />
        <Tile label="Encaissé au bar" value={formatPrice(day.totals.staff_paid_cents)} />
        <Tile
          label="Reste à encaisser"
          value={formatPrice(day.totals.to_collect_cents)}
          note={day.totals.to_collect_cents > 0 ? "à régler au bar" : undefined}
          warn={day.totals.to_collect_cents > 0}
        />
        <Tile label="Pourboires" value={formatPrice(day.totals.tips_cents)} />
      </section>
      {staffSplit.length > 0 && day.orders.some((o) => o.staff_payment) && (
        <p className="rounded-md border border-line bg-card px-4 py-3 text-[14px] text-ink-2">
          <strong className="text-ink">Au serveur :</strong>{" "}
          {staffSplit.map((part) => `${part.label} ${formatPrice(part.cents)}`).join(" · ")}
        </p>
      )}
      <p className="text-[13px] text-muted">
        Une journée va de 5 h à 5 h du matin. Les commandes annulées ({day.totals.cancelled_count}) ne sont pas comptées.
        Les pourboires ne sont pas inclus dans le chiffre d&apos;affaires.
      </p>

      {day.orders.length === 0 ? (
        <p className="card !p-10 text-center text-ink-2">Aucune commande ce jour-là.</p>
      ) : (
        <ul className="card divide-y divide-line !p-0">
          {day.orders.map((order) => (
            <li
              key={order.id}
              className={`flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-4 py-3.5 ${order.status === "cancelled" ? "opacity-55" : ""}`}
            >
              <span className="w-12 tabular-nums text-muted">{formatTime(order.created_at, venue.timezone)}</span>
              <span className="w-12 text-[13px] font-semibold text-ink-2">n° {order.order_number}</span>
              <span className="w-28 font-serif text-[20px] font-semibold leading-tight">{order.table_label}</span>
              <span className="min-w-48 flex-1 text-ink-2">
                {order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}
                {order.comment && <span className="block text-[13px] text-muted">« {order.comment} »</span>}
              </span>
              <span className="w-24 text-right font-bold tabular-nums">
                {formatPrice(order.total_cents)}
                {order.tip_cents > 0 && (
                  <span className="block text-[12px] font-medium text-gold-ink">+ {formatPrice(order.tip_cents)} pourb.</span>
                )}
              </span>
              <span className="flex w-64 flex-wrap justify-end gap-1.5">
                <span className={`badge ${order.payment_status === "paid" ? "badge--ok" : "badge--warn"}`}>{paymentLabel(order)}</span>
                <span className={`badge ${STATUS_LABEL[order.status].className}`}>{STATUS_LABEL[order.status].label}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={`stat-tile ${warn ? "!border-warn" : ""}`}>
      <span>{label}</span>
      <b className={warn ? "text-warn-ink" : ""}>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}
