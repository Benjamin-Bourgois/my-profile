import type { Metadata } from "next";
import Link from "next/link";

import { NewVenueSheet } from "@/components/agency/NewVenueSheet";
import { OpenVenueButtons } from "@/components/agency/OpenVenueButtons";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
import { agencyErrorMessage, type AgencyVenue } from "@/lib/agency";
import { formatPrice } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import { formatInteger } from "@/lib/stats";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bars · Espace agence" };

const FILTERS = [
  { value: "", label: "Tous" },
  { value: "actifs", label: "Actifs" },
  { value: "suspendus", label: "Suspendus" },
];

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const plural = (n: number, word: string) => `${formatInteger(n)} ${word}${n > 1 ? "s" : ""}`;

/** Tous les bars clients : état de l'abonnement, activité, accès. */
export default async function AgencyBarsPage(props: PageProps<"/agence">) {
  const { filtre } = await props.searchParams;
  const supabase = await getServerClient();
  const [{ data, error }, { data: appSalesData }] = await Promise.all([
    supabase.rpc("agency_get_venues"),
    supabase.rpc("agency_get_app_sales"), // absent si le script 10 n'a pas été exécuté
  ]);
  if (error) return <ErreurTechnique hint={agencyErrorMessage(error)} />;
  const appSales = (appSalesData ?? {}) as Record<string, number>;

  const venues = data as AgencyVenue[];
  const active = venues.filter((v) => !v.suspended_at);
  const shown = filtre === "actifs" ? active : filtre === "suspendus" ? venues.filter((v) => v.suspended_at) : venues;
  const orders = active.reduce((sum, v) => sum + v.orders_30d, 0);
  const revenue = active.reduce((sum, v) => sum + v.revenue_30d_cents, 0);
  const generated = active.reduce((sum, v) => sum + (appSales[v.id] ?? 0), 0);
  const loginUrl = `${await siteUrl()}/connexion`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-[30px]">Vos bars</h2>
          <p className="text-ink-2">Créez les bars et leurs accès, ouvrez-les comme leur gérant, suspendez un abonnement.</p>
        </div>
        <NewVenueSheet loginUrl={loginUrl} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-tile">
          <span>Bars actifs</span>
          <b>{formatInteger(active.length)}</b>
          <small>
            sur {plural(venues.length, "bar")}
            {venues.length > active.length && ` · ${plural(venues.length - active.length, "suspendu")}`}
          </small>
        </div>
        <div className="stat-tile">
          <span>Commandes</span>
          <b>{formatInteger(orders)}</b>
          <small>30 derniers jours, bars actifs</small>
        </div>
        <div className="stat-tile">
          <span>Chiffre d&apos;affaires des bars</span>
          <b>{formatPrice(revenue)}</b>
          <small>30 derniers jours</small>
        </div>
        <div className="stat-tile !border-gold">
          <span>Grâce à l&apos;application</span>
          <b>{formatPrice(generated)}</b>
          <small>ventes en plus (suggestions), 30 jours</small>
        </div>
      </div>

      <nav aria-label="Filtrer les bars" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/agence?filtre=${f.value}` : "/agence"}
            aria-current={(filtre ?? "") === f.value ? "page" : undefined}
            className="chip"
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="card !p-8 text-center text-ink-2">
          {venues.length === 0 ? "Aucun bar pour l'instant : créez le premier avec « Nouveau bar »." : "Aucun bar dans cette catégorie."}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((venue) => (
            <li key={venue.id} className={`card flex flex-col gap-3 !p-4 ${venue.suspended_at ? "!border-danger" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-[22px]">
                    <Link href={`/agence/bars/${venue.id}`} className="underline-offset-4 hover:underline">
                      {venue.name}
                    </Link>
                  </h3>
                  <p className="text-[13px] text-muted">
                    {venue.owners.length ? `Gérant : ${venue.owners.join(", ")}` : "Aucun gérant"} · {plural(venue.members, "compte")} ·{" "}
                    {plural(venue.tables, "table")}
                  </p>
                </div>
                {venue.suspended_at ? (
                  <span className="badge badge--danger shrink-0">Suspendu</span>
                ) : venue.orders_paused ? (
                  <span className="badge badge--warn shrink-0">En pause</span>
                ) : (
                  <span className="badge badge--ok shrink-0">Actif</span>
                )}
              </div>
              <p className="text-[14px] text-ink-2">
                {venue.suspended_at ? (
                  <>
                    Suspendu le {dateFormat.format(new Date(venue.suspended_at))}
                    {venue.suspended_note && <> · « {venue.suspended_note} »</>}
                  </>
                ) : (
                  <>
                    <strong className="text-ink">{plural(venue.orders_30d, "commande")}</strong> sur 30 jours ·{" "}
                    {formatPrice(venue.revenue_30d_cents)}
                    {venue.last_order_at && <> · dernière le {dateFormat.format(new Date(venue.last_order_at))}</>}
                  </>
                )}
              </p>
              {!venue.suspended_at && (appSales[venue.id] ?? 0) > 0 && (
                <p className="flex items-center gap-1.5 text-[14px] font-semibold text-gold-ink">
                  <Icon name="sparkle" size={15} />
                  {formatPrice(appSales[venue.id])} de ventes en plus grâce à l&apos;application (30 jours)
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Link href={`/agence/bars/${venue.id}`} className="btn btn--soft btn--sm">
                  <Icon name="lock" size={15} />
                  Accès et abonnement
                </Link>
                <OpenVenueButtons venueId={venue.id} only={["/admin", "/bar"]} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
