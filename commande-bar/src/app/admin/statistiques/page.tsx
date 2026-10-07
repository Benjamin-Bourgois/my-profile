import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon, type IconName } from "@/components/Icon";
import { BarList, ChartCard, ColumnChart, DataTable, Heatmap, Meter } from "@/components/stats/Charts";
import { requireOwnerVenue } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";
import { formatPrice } from "@/lib/format";
import {
  activeHours,
  bucketByDay,
  change,
  formatDuration,
  formatEurosCompact,
  formatInteger,
  formatPercent,
  hourLabel,
  hourRange,
  parsePeriod,
  PERIOD_PRESETS,
  periodLabel,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  type PeriodRequest,
  type StatsData,
} from "@/lib/stats";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Statistiques · Espace gérant" };

const SERVICE_BUCKETS = ["< 5", "5 – 10", "10 – 15", "15 – 20", "20 et +"];
const plural = (n: number, word: string) => `${formatInteger(n)} ${word}${n > 1 ? "s" : ""}`;

export default async function StatsPage(props: PageProps<"/admin/statistiques">) {
  const venue = await requireOwnerVenue();
  const request = parsePeriod(await props.searchParams);

  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("admin_get_stats", {
    p_venue_id: venue.id,
    p_from: request.from,
    p_to: request.to,
    p_days: request.days,
  });
  if (error) return <ErreurTechnique hint={adminErrorMessage(error)} />;
  const stats = data as StatsData;
  const { totals, previous, range } = stats;
  const exportHref = `/api/admin/export?du=${range.from}&au=${range.to}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="mr-auto">
          <p className="eyebrow first-letter:uppercase">{periodLabel(range, request)}</p>
          <h2 className="text-[30px]">Statistiques</h2>
        </div>
        <a href={exportHref} className="btn btn--ghost btn--sm" download>
          <Icon name="download" size={16} />
          Exporter les commandes (CSV)
        </a>
      </div>

      <PeriodFilter request={request} range={range} />

      {totals.orders === 0 ? (
        <p className="card !p-10 text-center text-ink-2">
          Aucune commande sur cette période. Choisissez une période plus longue ci-dessus.
        </p>
      ) : (
        <StatsContent stats={stats} previousLabel={`vs les ${range.days} jours précédents`} />
      )}

      <p className="text-[13px] text-muted">
        Calculs sur les commandes reçues par le bar : les commandes annulées et les paiements en ligne abandonnés ne sont pas
        comptés, les pourboires ne sont pas inclus dans le chiffre d&apos;affaires. Une journée va de 5 h à 5 h du matin.
        {totals.cancelled > 0 && ` ${plural(totals.cancelled, "commande annulée")} sur la période.`}
      </p>
      {previous.orders === 0 && totals.orders > 0 && (
        <p className="text-[13px] text-muted">Pas encore de commandes sur la période précédente : les évolutions apparaîtront ensuite.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PeriodFilter({ request, range }: { request: PeriodRequest; range: StatsData["range"] }) {
  const custom = Boolean(request.from || request.to);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIOD_PRESETS.map((preset) => (
        <Link
          key={preset.days}
          href={`/admin/statistiques?periode=${preset.days}`}
          aria-current={!custom && request.days === preset.days ? "page" : undefined}
          className="chip"
        >
          {preset.label}
        </Link>
      ))}
      <form action="/admin/statistiques" className="flex flex-wrap items-center gap-2 sm:ml-2">
        <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
          Du
          <input type="date" name="du" defaultValue={range.from} max={range.today} required className="input !min-h-9 !w-auto !px-3 !py-1.5 !text-[14px]" />
        </label>
        <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
          au
          <input type="date" name="au" defaultValue={range.to} max={range.today} required className="input !min-h-9 !w-auto !px-3 !py-1.5 !text-[14px]" />
        </label>
        <button type="submit" className={`btn btn--sm ${custom ? "btn--primary" : "btn--soft"}`}>
          Afficher
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatsContent({ stats, previousLabel }: { stats: StatsData; previousLabel: string }) {
  const { totals, previous, service, calls } = stats;

  // Chiffre d'affaires dans le temps
  const { unit, buckets } = bucketByDay(stats.by_day);

  // Affluence par heure (ordre d'une soirée), et par jour de la semaine
  const hourMap = new Map(stats.by_hour.map((h) => [h.hour, h]));
  const hours = activeHours(stats.by_hour.map((h) => h.hour));
  const heat = new Map(stats.heatmap.map((c) => [`${c.weekday}-${c.hour}`, c.orders]));
  const weekdays = stats.by_weekday.map((w) => ({ ...w, avg: w.days ? Math.round(w.revenue_cents / w.days) : 0 }));

  // Points clés
  const bestDay = [...weekdays].sort((a, b) => b.avg - a.avg)[0];
  const peak = [...stats.by_hour].sort((a, b) => b.orders - a.orders)[0];
  const topProduct = stats.products[0];
  const topRevenueProduct = [...stats.products].sort((a, b) => b.revenue_cents - a.revenue_cents)[0];
  const topTable = stats.tables[0];
  const topCategory = stats.categories[0];
  const categoriesTotal = stats.categories.reduce((sum, c) => sum + c.revenue_cents, 0);
  const avgPerOpenDay = totals.active_days ? Math.round(totals.revenue_cents / totals.active_days) : 0;

  return (
    <>
      {/* Chiffres clés */}
      <section aria-label="Chiffres clés" className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <Kpi label="Chiffre d'affaires" value={formatPrice(totals.revenue_cents)} delta={change(totals.revenue_cents, previous.revenue_cents)} note={previousLabel} />
        <Kpi label="Commandes" value={formatInteger(totals.orders)} delta={change(totals.orders, previous.orders)} note={previousLabel} />
        <Kpi label="Panier moyen" value={formatPrice(totals.avg_basket_cents)} delta={change(totals.avg_basket_cents, previous.avg_basket_cents)} note={previousLabel} />
        <Kpi label="Articles vendus" value={formatInteger(totals.items)} delta={change(totals.items, previous.items)} note={previousLabel} />
        <Kpi label="Pourboires" value={formatPrice(totals.tips_cents)} delta={change(totals.tips_cents, previous.tips_cents)} note={previousLabel} />
        <Kpi
          label="Temps de service moyen"
          value={formatDuration(service.avg_seconds)}
          delta={change(service.avg_seconds, previous.avg_service_seconds)}
          lowerIsBetter
          note={previousLabel}
        />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <ChartCard title="Points clés" subtitle="Ce qui ressort de la période">
          <ul className="grid gap-3">
            <Insight icon="clock" label="Jour le plus rentable">
              {bestDay && bestDay.avg > 0 ? (
                <>
                  <strong className="first-letter:uppercase">{WEEKDAYS[bestDay.weekday - 1]}</strong> · {formatPrice(bestDay.avg)} en moyenne
                </>
              ) : (
                "—"
              )}
            </Insight>
            <Insight icon="bell" label="Heure de pointe">
              {peak ? (
                <>
                  <strong>{hourRange(peak.hour)}</strong> · {plural(peak.orders, "commande")}
                </>
              ) : (
                "—"
              )}
            </Insight>
            <Insight icon="glass" label="Produit le plus commandé">
              {topProduct ? (
                <>
                  <strong>{topProduct.name}</strong> · {plural(topProduct.quantity, "vente")}
                </>
              ) : (
                "—"
              )}
            </Insight>
            {topRevenueProduct && topRevenueProduct.name !== topProduct?.name && (
              <Insight icon="card" label="Produit qui rapporte le plus">
                <strong>{topRevenueProduct.name}</strong> · {formatPrice(topRevenueProduct.revenue_cents)}
              </Insight>
            )}
            <Insight icon="qr" label="Table la plus rentable">
              {topTable ? (
                <>
                  <strong>{topTable.label}</strong> · {formatPrice(topTable.revenue_cents)} ({plural(topTable.orders, "commande")})
                </>
              ) : (
                "—"
              )}
            </Insight>
            <Insight icon="receipt" label="Chiffre d'affaires par jour d'ouverture">
              <strong>{formatPrice(avgPerOpenDay)}</strong> · {plural(totals.active_days, "jour")} avec des commandes
            </Insight>
          </ul>
        </ChartCard>

        <ChartCard title="Paiement" subtitle="Répartition du chiffre d'affaires">
          <Meter
            value={totals.online_cents}
            total={totals.online_cents + totals.staff_cents}
            labels={[
              `Payé en ligne · ${formatPercent(totals.online_cents, totals.revenue_cents)} · ${formatPrice(totals.online_cents)} (${plural(totals.online_orders, "commande")})`,
              `Au bar · ${formatPercent(totals.staff_cents, totals.revenue_cents)} · ${formatPrice(totals.staff_cents)} (${plural(totals.staff_orders, "commande")})`,
            ]}
          />
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <MiniStat label="Pourboires" value={formatPrice(totals.tips_cents)} note={`${formatPercent(totals.tip_orders, totals.online_orders)} des paiements en ligne`} />
            <MiniStat
              label="Pourboire moyen"
              value={totals.tip_orders ? formatPrice(Math.round(totals.tips_cents / totals.tip_orders)) : "—"}
              note="quand il y en a un"
            />
            {totals.to_collect_cents > 0 && (
              <MiniStat label="Reste à encaisser" value={formatPrice(totals.to_collect_cents)} note="commandes « Payer au serveur »" warn />
            )}
          </dl>
        </ChartCard>
      </div>

      <ChartCard
        title="Chiffre d'affaires"
        subtitle={`Par ${unit} · la plus haute barre est indiquée, survolez ou touchez une barre pour le détail`}
      >
        <ColumnChart
          ariaLabel={`Chiffre d'affaires par ${unit}`}
          points={buckets.map((b) => ({
            key: b.key,
            label: b.label,
            value: b.revenue_cents,
            tooltip: { value: formatPrice(b.revenue_cents), lines: [plural(b.orders, "commande")], title: b.title },
          }))}
          formatTick={formatEurosCompact}
          formatValue={formatEurosCompact}
        />
        <DataTable
          caption={`Chiffre d'affaires par ${unit}`}
          head={[unit === "jour" ? "Jour" : unit === "semaine" ? "Semaine" : "Mois", "Commandes", "Chiffre d'affaires"]}
          numeric={[1, 2]}
          rows={buckets.map((b) => [b.title, formatInteger(b.orders), formatPrice(b.revenue_cents)])}
        />
      </ChartCard>

      <div className="grid gap-3 md:grid-cols-2">
        <ChartCard title="Affluence par heure" subtitle="Nombre de commandes reçues, toutes journées confondues">
          <ColumnChart
            ariaLabel="Commandes par heure"
            points={hours.map((hour) => {
              const h = hourMap.get(hour);
              return {
                key: String(hour),
                label: hourLabel(hour),
                value: h?.orders ?? 0,
                tooltip: { value: plural(h?.orders ?? 0, "commande"), lines: [formatPrice(h?.revenue_cents ?? 0)], title: hourRange(hour) },
              };
            })}
            formatTick={(v) => formatInteger(v)}
            formatValue={(v) => formatInteger(v)}
            maxLabels={7}
          />
          <DataTable
            caption="Commandes par heure"
            head={["Heure", "Commandes", "Chiffre d'affaires"]}
            numeric={[1, 2]}
            rows={hours.map((hour) => [hourRange(hour), formatInteger(hourMap.get(hour)?.orders ?? 0), formatPrice(hourMap.get(hour)?.revenue_cents ?? 0)])}
          />
        </ChartCard>

        <ChartCard title="Jours de la semaine" subtitle="Chiffre d'affaires moyen par jour">
          <ColumnChart
            ariaLabel="Chiffre d'affaires moyen par jour de la semaine"
            points={weekdays.map((w) => ({
              key: String(w.weekday),
              label: WEEKDAYS_SHORT[w.weekday - 1],
              value: w.avg,
              tooltip: {
                value: `${formatPrice(w.avg)} en moyenne`,
                lines: [`${plural(w.orders, "commande")} sur ${plural(w.days, "jour")}`],
                title: WEEKDAYS[w.weekday - 1],
              },
            }))}
            formatTick={formatEurosCompact}
            formatValue={formatEurosCompact}
          />
          <DataTable
            caption="Chiffre d'affaires par jour de la semaine"
            head={["Jour", "CA moyen", "Commandes", "CA total"]}
            numeric={[1, 2, 3]}
            rows={weekdays.map((w) => [WEEKDAYS[w.weekday - 1], formatPrice(w.avg), formatInteger(w.orders), formatPrice(w.revenue_cents)])}
          />
        </ChartCard>
      </div>

      <ChartCard title="Quand vos clients commandent" subtitle="Commandes par jour et par heure : plus la case est foncée, plus il y a de monde">
        <Heatmap
          rows={[1, 2, 3, 4, 5, 6, 7]}
          columns={hours}
          value={(row, column) => heat.get(`${row}-${column}`) ?? 0}
          rowLabel={(row) => WEEKDAYS_SHORT[row - 1]}
          columnLabel={(column) => String(column)}
          cellTitle={(row, column) => `${WEEKDAYS[row - 1]}, ${hourRange(column)}`}
        />
        <DataTable
          caption="Commandes par jour et par heure"
          head={["Jour", ...hours.map(hourLabel)]}
          numeric={hours.map((_, i) => i + 1)}
          rows={[1, 2, 3, 4, 5, 6, 7].map((row) => [WEEKDAYS_SHORT[row - 1], ...hours.map((hour) => heat.get(`${row}-${hour}`) ?? 0)])}
        />
      </ChartCard>

      <div className="grid gap-3 md:grid-cols-2">
        <ChartCard title="Meilleures ventes" subtitle="Les 10 produits les plus commandés (quantité)">
          <BarList
            ariaLabel="Produits les plus commandés"
            rows={stats.products.slice(0, 10).map((p) => ({
              key: p.name,
              label: p.name,
              value: p.quantity,
              display: formatInteger(p.quantity),
              detail: formatPrice(p.revenue_cents),
            }))}
          />
          <DataTable
            caption="Ventes par produit"
            head={["Produit", "Quantité", "Commandes", "Chiffre d'affaires"]}
            numeric={[1, 2, 3]}
            rows={stats.products.map((p) => [p.name, formatInteger(p.quantity), formatInteger(p.orders), formatPrice(p.revenue_cents)])}
          />
        </ChartCard>

        <ChartCard title="Catégories" subtitle="Part du chiffre d'affaires">
          <BarList
            ariaLabel="Chiffre d'affaires par catégorie"
            rows={stats.categories.map((c) => ({
              key: c.name,
              label: c.name,
              value: c.revenue_cents,
              display: formatPercent(c.revenue_cents, categoriesTotal),
              detail: `${formatPrice(c.revenue_cents)} · ${plural(c.quantity, "article")}`,
            }))}
          />
          {topCategory && (
            <p className="mt-4 text-[13px] text-ink-2">
              <strong className="text-ink">{topCategory.name}</strong> représente {formatPercent(topCategory.revenue_cents, categoriesTotal)} du chiffre
              d&apos;affaires.
            </p>
          )}
        </ChartCard>
      </div>

      {stats.unsold.length > 0 && (
        <ChartCard title="Jamais commandés sur la période" subtitle="À mettre en avant, à revoir… ou à retirer de la carte">
          <ul className="flex flex-wrap gap-2">
            {stats.unsold.map((p) => (
              <li key={p.name} className="badge !text-[12px] !normal-case !tracking-normal">
                {p.name}
                {!p.available && <span className="text-danger">· épuisé</span>}
              </li>
            ))}
          </ul>
        </ChartCard>
      )}

      <ChartCard title="Tables" subtitle="Classées par chiffre d'affaires">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">Chiffre d&apos;affaires par table</caption>
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th scope="col" className="border-b border-line py-2 pr-3 font-bold">Table</th>
                <th scope="col" className="border-b border-line py-2 pr-3 text-right font-bold">
                  <span className="max-sm:hidden">Commandes</span>
                  <span className="sm:hidden">Cdes</span>
                </th>
                <th scope="col" className="border-b border-line py-2 pr-3 font-bold sm:w-[40%]">
                  <span className="max-sm:hidden">Chiffre d&apos;affaires</span>
                  <span className="sm:hidden">CA</span>
                </th>
                <th scope="col" className="border-b border-line py-2 pr-3 text-right font-bold">
                  <span className="max-sm:hidden">Panier moyen</span>
                  <span className="sm:hidden">Panier</span>
                </th>
                <th scope="col" className="border-b border-line py-2 text-right font-bold max-sm:hidden">Pourboires</th>
              </tr>
            </thead>
            <tbody>
              {stats.tables.map((t) => (
                <tr key={t.label} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="whitespace-nowrap py-2 pr-3 text-left font-serif text-[18px] font-semibold">{t.label}</th>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatInteger(t.orders)}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 rounded-r-[4px] bg-chart max-sm:hidden"
                        style={{ width: `calc((100% - 5.5rem) * ${t.revenue_cents / Math.max(1, stats.tables[0]?.revenue_cents ?? 1)})` }}
                      />
                      <span className="whitespace-nowrap font-semibold tabular-nums">{formatPrice(t.revenue_cents)}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatPrice(t.avg_basket_cents)}</td>
                  <td className="py-2 text-right tabular-nums text-ink-2 max-sm:hidden">{formatPrice(t.tips_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid gap-3 md:grid-cols-2">
        <ChartCard title="Rapidité du service" subtitle="De la réception de la commande au clic « Servie » (en minutes)">
          <dl className="grid grid-cols-2 gap-3">
            <MiniStat label="Temps moyen" value={formatDuration(service.avg_seconds)} note={`médiane : ${formatDuration(service.median_seconds)}`} />
            <MiniStat
              label="Servies en moins de 10 min"
              value={formatPercent(service.within_10_min, service.measured)}
              note={`${formatInteger(service.within_10_min)} sur ${formatInteger(service.measured)}`}
            />
            <MiniStat label="Prise en charge" value={formatDuration(service.avg_pickup_seconds)} note="avant « En préparation »" />
          </dl>
          <div className="mt-5 border-t border-line pt-4">
            <ColumnChart
              ariaLabel="Répartition des temps de service"
              height={120}
              points={service.buckets.map((count, i) => ({
                key: SERVICE_BUCKETS[i],
                label: SERVICE_BUCKETS[i],
                value: count,
                tooltip: { value: plural(count, "commande"), lines: [formatPercent(count, service.measured)], title: `Servies en ${SERVICE_BUCKETS[i]} min` },
              }))}
              formatTick={(v) => formatInteger(v)}
              formatValue={(v) => formatInteger(v)}
            />
          </div>
        </ChartCard>

        <ChartCard title="Appels des tables" subtitle="Boutons « Appeler un serveur » et « L'addition »">
          <dl className="grid grid-cols-2 gap-3">
            <MiniStat label="Appels du serveur" value={formatInteger(calls.waiter)} />
            <MiniStat label="Demandes d'addition" value={formatInteger(calls.bill)} />
            <MiniStat label="Temps de réponse moyen" value={formatDuration(calls.avg_response_seconds)} note="jusqu'au clic « Fait »" />
            <MiniStat label="Commentaires laissés" value={formatInteger(totals.comments)} note={`${formatPercent(totals.comments, totals.orders)} des commandes`} />
          </dl>
        </ChartCard>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  delta,
  note,
  lowerIsBetter,
}: {
  label: string;
  value: string;
  delta: number | null;
  note: string;
  lowerIsBetter?: boolean;
}) {
  const rounded = delta === null ? null : Math.round(delta * 100);
  const good = rounded === null || rounded === 0 ? null : (rounded > 0) !== Boolean(lowerIsBetter);
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <b>{value}</b>
      {rounded === null ? (
        <small className="text-muted">Pas de comparaison</small>
      ) : (
        <small className={`flex flex-wrap items-center gap-x-1 font-semibold ${good === null ? "text-ink-2" : good ? "text-ok" : "text-danger"}`}>
          {rounded !== 0 && <Icon name={rounded > 0 ? "chevronUp" : "chevronDown"} size={14} />}
          {rounded >= 300 ? `× ${formatInteger(Math.round(1 + (delta ?? 0)))}` : `${rounded > 0 ? "+" : ""}${rounded} %`}
          <span className="font-normal text-muted">{note}</span>
        </small>
      )}
    </div>
  );
}

function MiniStat({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] font-bold text-muted">{label}</dt>
      <dd className={`font-serif text-[26px] font-semibold leading-tight ${warn ? "text-warn-ink" : ""}`}>{value}</dd>
      {note && <dd className="text-[12px] text-ink-2">{note}</dd>}
    </div>
  );
}

function Insight({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sand-2 text-ink-2">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-muted">{label}</p>
        <p className="text-[15px]">{children}</p>
      </div>
    </li>
  );
}
