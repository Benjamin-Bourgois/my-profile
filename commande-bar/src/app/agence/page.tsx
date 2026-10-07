import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/connexion/actions";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
import { MessageScreen } from "@/components/MessageScreen";
import { adminErrorMessage } from "@/lib/admin-errors";
import { formatDollars, monthLabel, parseMonth, type AgencyUsage } from "@/lib/agency";
import { scanCostDollars, SCAN_PRICE_PER_MILLION } from "@/lib/delivery-scan";
import { diagnose } from "@/lib/diagnose";
import { isScanConfigured, missingConfig } from "@/lib/env";
import { getStaffSession } from "@/lib/staff";
import { formatInteger } from "@/lib/stats";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Espace agence", robots: { index: false } };

const plural = (n: number, word: string) => `${formatInteger(n)} ${word}${n > 1 ? "s" : ""}`;

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** Espace de l'agence : activation de l'IA et coût des lectures de bons, bar par bar. */
export default async function AgencePage(props: PageProps<"/agence">) {
  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  let session;
  try {
    session = await getStaffSession();
  } catch (error) {
    console.error("Espace agence : lecture du compte impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }
  if (!session) redirect("/connexion?next=/agence");

  const month = parseMonth((await props.searchParams).mois);
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("agency_get_usage", { p_month: month });
  if (error?.message === "ACCES_REFUSE") {
    return (
      <MessageScreen icon="lock" title="Réservé à l'agence">
        <p>Le compte {session.user.email} n&apos;est pas un compte de l&apos;agence.</p>
        <form action={signOut} className="mt-6">
          <button type="submit" className="btn btn--ghost">
            Se déconnecter
          </button>
        </form>
      </MessageScreen>
    );
  }
  if (error) return <ErreurTechnique hint={adminErrorMessage(error)} />;

  const usage = data as AgencyUsage;
  const enabled = isScanConfigured();
  const rows = usage.venues.map((venue) => ({ ...venue, cost: scanCostDollars(venue.input_tokens, venue.output_tokens) }));
  const total = rows.reduce(
    (sum, row) => ({
      scans: sum.scans + row.scans,
      read: sum.read + row.read,
      applied: sum.applied + row.applied,
      pages: sum.pages + row.pages,
      cost: sum.cost + row.cost,
    }),
    { scans: 0, read: 0, applied: 0, pages: 0, cost: 0 },
  );
  const activeBars = rows.filter((row) => row.scans > 0).length;
  const isCurrent = usage.month === usage.current_month;
  const ownedVenue = session.venues.find((v) => v.role === "owner");

  return (
    <div className="min-h-dvh pb-16">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Tapigo</p>
            <h1 className="truncate text-[24px]">Espace agence</h1>
          </div>
          {ownedVenue && (
            <Link href="/admin" className="btn btn--ghost btn--sm">
              Espace gérant
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" aria-label="Déconnexion" title="Déconnexion" className="icon-btn">
              <Icon name="logout" size={17} />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-8 px-4 py-6">
        <section aria-labelledby="ia" className="card !p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-soft text-gold">
              <Icon name="sparkle" size={20} />
            </span>
            <h2 id="ia" className="mr-auto text-[24px]">
              Lecture des bons de livraison par l&apos;IA
            </h2>
            {enabled ? <span className="badge badge--ok">Activée</span> : <span className="badge badge--warn">Pas encore activée</span>}
          </div>
          {enabled ? (
            <p className="mt-3 text-ink-2">
              Le bouton « Scanner un bon » est disponible dans la page Stocks de tous les bars. Limites : 8 lectures par personne
              toutes les 10 minutes, 40 par bar et par jour. Pensez à fixer une dépense maximale par mois dans la console
              d&apos;Anthropic.
            </p>
          ) : (
            <>
              <p className="mt-3 text-ink-2">
                Tout est prêt : il ne manque que la clé de l&apos;agence. Tant qu&apos;elle n&apos;est pas installée, le bouton
                « Scanner un bon » n&apos;apparaît pas chez les bars. Pour l&apos;activer :
              </p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-ink-2">
                <li>
                  Sur <strong className="text-ink">platform.claude.com</strong>, crée le compte de l&apos;agence, ajoute ta carte
                  et un petit crédit (10 $ suffisent pour des centaines de bons), puis fixe une dépense maximale par mois.
                </li>
                <li>
                  <strong className="text-ink">API Keys → Create Key</strong> : copie la clé qui commence par{" "}
                  <code className="rounded bg-sand-2 px-1">sk-ant-</code> (elle ne s&apos;affiche qu&apos;une fois).
                </li>
                <li>
                  Vercel → <strong className="text-ink">Settings → Environment Variables</strong> :{" "}
                  <code className="rounded bg-sand-2 px-1">ANTHROPIC_API_KEY</code> = la clé, type <strong className="text-ink">Secret</strong>
                  , puis <strong className="text-ink">Deployments → ⋯ → Redeploy</strong>.
                </li>
              </ol>
              <p className="mt-3 text-[13px] text-muted">Une seule clé pour tous les bars : ils n&apos;ont aucun compte à créer.</p>
            </>
          )}
        </section>

        <section aria-labelledby="usage" className="space-y-4">
          <div>
            <p className="eyebrow first-letter:uppercase">{monthLabel(usage.month)}</p>
            <h2 id="usage" className="text-[30px]">
              Lectures de bons par bar
            </h2>
          </div>

          <nav aria-label="Mois" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {usage.months.map((m) => (
              <Link
                key={m}
                href={m === usage.current_month ? "/agence" : `/agence?mois=${m.slice(0, 7)}`}
                aria-current={m === usage.month ? "page" : undefined}
                className="chip shrink-0 first-letter:uppercase"
              >
                {monthLabel(m)}
              </Link>
            ))}
          </nav>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="stat-tile">
              <span>Lectures</span>
              <b>{formatInteger(total.scans)}</b>
              <small>{formatInteger(total.pages)} page{total.pages > 1 ? "s" : ""}</small>
            </div>
            <div className="stat-tile">
              <span>Coût estimé</span>
              <b>{formatDollars(total.cost)}</b>
              <small>{isCurrent ? "depuis le 1er du mois" : "sur le mois"}</small>
            </div>
            <div className="stat-tile">
              <span>Livraisons enregistrées</span>
              <b>{formatInteger(total.applied)}</b>
              <small>après vérification</small>
            </div>
            <div className="stat-tile">
              <span>Bars utilisateurs</span>
              <b>{formatInteger(activeBars)}</b>
              <small>sur {formatInteger(rows.length)} bar{rows.length > 1 ? "s" : ""}</small>
            </div>
          </div>

          {/* Téléphone : une carte par bar */}
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className={`card flex items-start gap-3 !p-4 ${row.scans === 0 ? "text-muted" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-[13px] text-ink-2">
                    {plural(row.scans, "lecture")} · {plural(row.read, "réussie")} · {plural(row.applied, "enregistrée")} ·{" "}
                    {plural(row.pages, "page")}
                  </p>
                  {row.last_scan_at && (
                    <p className="text-[12px] text-muted">Dernière lecture : {dateFormat.format(new Date(row.last_scan_at))}</p>
                  )}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{row.scans ? formatDollars(row.cost) : "—"}</p>
              </li>
            ))}
            <li className="flex items-center justify-between rounded-md bg-sand-2 px-4 py-3 font-bold">
              <span>Total · {plural(total.scans, "lecture")}</span>
              <span className="tabular-nums">{formatDollars(total.cost)}</span>
            </li>
          </ul>

          {/* Ordinateur et tablette : tableau */}
          <div className="card hidden overflow-x-auto !p-0 md:block">
            <table className="w-full min-w-[600px] border-collapse text-[14px]">
              <caption className="sr-only">Lectures de bons et coût estimé par bar, {monthLabel(usage.month)}</caption>
              <thead>
                <tr className="text-[12px] text-muted">
                  <th scope="col" className="border-b border-line px-4 py-3 text-left font-bold">
                    Bar
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 text-right font-bold">
                    Lectures
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 text-right font-bold">
                    Réussies
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 text-right font-bold">
                    Enregistrées
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 text-right font-bold">
                    Pages
                  </th>
                  <th scope="col" className="border-b border-line px-4 py-3 text-right font-bold">
                    Coût estimé
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={`border-b border-line/60 ${row.scans === 0 ? "text-muted" : ""}`}>
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      {row.name}
                      {row.last_scan_at && (
                        <span className="block text-[12px] font-normal text-muted">
                          Dernière lecture : {dateFormat.format(new Date(row.last_scan_at))}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums">{formatInteger(row.scans)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatInteger(row.read)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatInteger(row.applied)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatInteger(row.pages)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.scans ? formatDollars(row.cost) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-sand-2 font-bold">
                  <th scope="row" className="px-4 py-3 text-left">
                    Total
                  </th>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInteger(total.scans)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInteger(total.read)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInteger(total.applied)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInteger(total.pages)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatDollars(total.cost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[13px] text-muted">
            Coût estimé d&apos;après le tarif de Claude ({SCAN_PRICE_PER_MILLION.input} $ par million de jetons envoyés,{" "}
            {SCAN_PRICE_PER_MILLION.output} $ par million produits) ; la facture d&apos;Anthropic fait foi. Les lectures qui
            échouent (photo illisible, document qui n&apos;est pas un bon…) sont comptées : elles coûtent peu ou rien. Mois
            calculés à l&apos;heure de Paris.
          </p>
        </section>
      </main>
    </div>
  );
}
