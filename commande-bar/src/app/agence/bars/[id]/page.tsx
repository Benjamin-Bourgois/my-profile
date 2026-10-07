import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddMemberForm, MemberRow } from "@/components/agency/Accounts";
import { OpenVenueButtons } from "@/components/agency/OpenVenueButtons";
import { SuspendCard } from "@/components/agency/SuspendCard";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
import { agencyErrorMessage, type AgencyVenueDetail } from "@/lib/agency";
import { formatPrice } from "@/lib/format";
import { UUID_PATTERN } from "@/lib/order-types";
import { newPassword } from "@/lib/password";
import { siteUrl } from "@/lib/site-url";
import { formatInteger } from "@/lib/stats";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bar · Espace agence" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/** Fiche d'un bar pour l'agence : ouvrir le bar, ses comptes, son abonnement. */
export default async function AgencyBarPage(props: PageProps<"/agence/bars/[id]">) {
  const { id } = await props.params;
  if (!UUID_PATTERN.test(id)) notFound();
  const supabase = await getServerClient();
  const [{ data, error }, { data: appSalesData }] = await Promise.all([
    supabase.rpc("agency_get_venue", { p_venue_id: id }),
    supabase.rpc("agency_get_app_sales"), // absent si le script 10 n'a pas été exécuté
  ]);
  if (error?.message === "INTROUVABLE") notFound();
  if (error) return <ErreurTechnique hint={agencyErrorMessage(error)} />;
  const generated = ((appSalesData ?? {}) as Record<string, number>)[id] ?? 0;

  const venue = data as AgencyVenueDetail;
  const loginUrl = `${await siteUrl()}/connexion`;
  const owners = venue.members.filter((m) => m.role === "owner").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/agence" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink">
          <Icon name="arrowLeft" size={15} />
          Tous les bars
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="break-words text-[30px]">{venue.name}</h2>
          {venue.suspended_at ? <span className="badge badge--danger">Suspendu</span> : <span className="badge badge--ok">Actif</span>}
        </div>
        <p className="text-[14px] text-muted">
          Client depuis le {dateFormat.format(new Date(venue.created_at))} · {formatInteger(venue.tables)} table
          {venue.tables > 1 ? "s" : ""} active{venue.tables > 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-tile">
          <span>Commandes</span>
          <b>{formatInteger(venue.orders_30d)}</b>
          <small>30 derniers jours</small>
        </div>
        <div className="stat-tile">
          <span>Chiffre d&apos;affaires</span>
          <b>{formatPrice(venue.revenue_30d_cents)}</b>
          <small>30 derniers jours</small>
        </div>
        <div className="stat-tile !border-gold">
          <span>Grâce à l&apos;application</span>
          <b>{formatPrice(generated)}</b>
          <small>ventes en plus, 30 jours</small>
        </div>
        <div className="stat-tile">
          <span>Dernière commande</span>
          <b className="!text-[24px]">{venue.last_order_at ? dateFormat.format(new Date(venue.last_order_at)) : "—"}</b>
        </div>
      </div>

      <section aria-labelledby="ouvrir" className="card !p-5">
        <h3 id="ouvrir" className="text-[22px]">
          Ouvrir ce bar
        </h3>
        <p className="mt-1 text-ink-2">
          Vous voyez et modifiez tout comme son gérant : carte, tables et cartes NFC, réglages, commandes, stocks, statistiques.
        </p>
        <div className="mt-3">
          <OpenVenueButtons venueId={venue.id} />
        </div>
      </section>

      <section aria-labelledby="acces" className="card !p-5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 id="acces" className="text-[22px]">
            Accès
          </h3>
          <p className="text-[14px] text-muted">
            {formatInteger(venue.members.length)} compte{venue.members.length > 1 ? "s" : ""}
            {owners === 0 && venue.members.length > 0 && " · aucun gérant"}
          </p>
        </div>
        {venue.members.length === 0 ? (
          <p className="mt-2 text-ink-2">Aucun compte : ajoutez au moins le gérant ci-dessous.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {venue.members.map((member) => (
              <MemberRow key={member.user_id} venueId={venue.id} member={member} loginUrl={loginUrl} />
            ))}
          </ul>
        )}
        <div className="mt-4">
          <AddMemberForm venueId={venue.id} loginUrl={loginUrl} initialPassword={newPassword()} />
        </div>
      </section>

      <SuspendCard venueId={venue.id} venueName={venue.name} suspendedAt={venue.suspended_at} note={venue.suspended_note} />
    </div>
  );
}
