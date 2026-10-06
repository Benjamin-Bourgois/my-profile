import Link from "next/link";

import { ErreurTechnique } from "@/components/ErreurTechnique";
import { requireOwnerVenue } from "@/lib/admin";
import type { DayData } from "@/lib/admin-types";
import { adminErrorMessage } from "@/lib/admin-errors";
import { formatPrice, formatTime } from "@/lib/format";
import { paymentLabel, type OrderStatus } from "@/lib/order-types";
import { getServerClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Paiement en cours",
  received: "Reçue",
  preparing: "En préparation",
  served: "Servie",
  cancelled: "Annulée",
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
  const { data, error } = await supabase.rpc("admin_get_day", { p_venue_id: venue.id, p_date: date });
  if (error) return <ErreurTechnique hint={adminErrorMessage(error)} />;
  const day = data as DayData;
  const isToday = day.business_date === day.today;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">{isToday ? "Commandes du jour" : "Commandes"}</h2>
        <span className="text-lg text-stone-600 first-letter:uppercase">{formatDay(day.business_date)}</span>
        <div className="ml-auto flex gap-2">
          <Link href={`/admin?jour=${shiftDate(day.business_date, -1)}`} className="flex h-11 items-center rounded-xl bg-white px-4 font-semibold ring-1 ring-stone-300">
            ← Jour précédent
          </Link>
          {!isToday && (
            <Link href="/admin" className="flex h-11 items-center rounded-xl bg-white px-4 font-semibold ring-1 ring-stone-300">
              Aujourd&apos;hui
            </Link>
          )}
          <Link href={isToday ? "/admin" : `/admin?jour=${day.business_date}`} className="flex h-11 items-center rounded-xl bg-stone-900 px-4 font-semibold text-white">
            Actualiser
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Totaux">
        <Tile label="Chiffre d'affaires" value={formatPrice(day.totals.revenue_cents)} strong />
        <Tile label="Commandes" value={String(day.totals.count)} />
        <Tile label="Payé en ligne" value={formatPrice(day.totals.online_cents)} />
        <Tile label="Encaissé au bar" value={formatPrice(day.totals.staff_paid_cents)} />
        <Tile label="Reste à encaisser" value={formatPrice(day.totals.to_collect_cents)} warn={day.totals.to_collect_cents > 0} />
      </section>
      <p className="text-sm text-stone-500">
        Une journée va de 5 h à 5 h du matin. Les commandes annulées ({day.totals.cancelled_count}) ne sont pas comptées.
      </p>

      {day.orders.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-lg text-stone-500 ring-1 ring-stone-200">
          Aucune commande ce jour-là.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {day.orders.map((order) => (
            <li key={order.id} className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 ${order.status === "cancelled" ? "opacity-50" : ""}`}>
              <span className="w-14 tabular-nums text-stone-500">{formatTime(order.created_at, venue.timezone)}</span>
              <span className="w-12 font-semibold">n° {order.order_number}</span>
              <span className="w-28 font-bold">{order.table_label}</span>
              <span className="min-w-48 flex-1 text-stone-700">
                {order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}
                {order.comment && <span className="block text-sm text-stone-500">💬 {order.comment}</span>}
              </span>
              <span className="w-20 text-right font-bold tabular-nums">{formatPrice(order.total_cents)}</span>
              <span className="w-36 text-sm text-stone-600">{paymentLabel(order)}</span>
              <span className="w-28 text-sm font-semibold">{STATUS_LABEL[order.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${strong ? "bg-stone-900 text-white ring-stone-900" : warn ? "bg-amber-100 ring-amber-300" : "bg-white ring-stone-200"}`}>
      <p className={`text-sm ${strong ? "text-stone-300" : "text-stone-500"}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
