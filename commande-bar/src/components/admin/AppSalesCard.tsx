import Link from "next/link";

import { Icon } from "@/components/Icon";
import { appSalesTotal, type AppSales } from "@/lib/app-sales";
import { formatPrice } from "@/lib/format";
import { formatInteger } from "@/lib/stats";

const items = (n: number) => `${formatInteger(n)} article${n > 1 ? "s" : ""}`;

/** « Ce que l'application vous a rapporté » sur une période (page Statistiques). */
export function AppSalesCard({ sales }: { sales: AppSales }) {
  const total = appSalesTotal(sales);
  const share = sales.revenue_cents > 0 ? Math.round((total / sales.revenue_cents) * 100) : 0;

  return (
    <section aria-labelledby="app-sales" className="card overflow-hidden !p-0">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-matte px-5 py-5 text-sand">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-matte">
          <Icon name="sparkle" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="app-sales" className="eyebrow !text-gold">
            Ce que l&apos;application vous a rapporté
          </h2>
          <p className="font-serif text-[40px] font-semibold leading-tight lining-nums tabular-nums">{formatPrice(total)}</p>
          <p className="text-[14px] opacity-80">
            {total > 0
              ? `de ventes en plus grâce aux suggestions, soit ${share} % du chiffre d'affaires de la période`
              : sales.enabled
                ? "Pas encore de vente grâce aux suggestions sur cette période."
                : "Les suggestions aux clients sont désactivées."}
          </p>
        </div>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-2">
        <div className="bg-card px-5 py-4">
          <p className="text-[12px] font-bold text-muted">« Souvent pris avec » (panier)</p>
          <p className="mt-0.5 font-serif text-[26px] font-semibold lining-nums">{formatPrice(sales.period.pairing_cents)}</p>
          <p className="text-[13px] text-ink-2">{items(sales.period.pairing_items)} ajoutés en un geste</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-[12px] font-bold text-muted">« Une autre tournée ? » (après le service)</p>
          <p className="mt-0.5 font-serif text-[26px] font-semibold lining-nums">{formatPrice(sales.period.reorder_cents)}</p>
          <p className="text-[13px] text-ink-2">{items(sales.period.reorder_items)} recommandés</p>
        </div>
      </div>
      <p className="border-t border-line bg-card px-5 py-3 text-[13px] text-muted">
        Articles ajoutés depuis une suggestion de l&apos;application, dans des commandes servies ou payées.{" "}
        {!sales.enabled && (
          <Link href="/admin/reglages" className="font-semibold text-ink underline">
            Activer les suggestions
          </Link>
        )}
      </p>
    </section>
  );
}

/** Bandeau de l'accueil gérant : ce que l'appli a rapporté depuis le début du mois. */
export function AppSalesBanner({ monthCents }: { monthCents: number }) {
  if (monthCents <= 0) return null;
  return (
    <Link
      href="/admin/statistiques"
      className="card card--hover flex items-center gap-4 !border-gold !bg-gold-soft !py-3.5"
    >
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-matte">
        <Icon name="sparkle" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        Ce mois-ci, l&apos;application vous a rapporté <strong className="font-serif text-[20px] lining-nums">{formatPrice(monthCents)}</strong> de
        ventes en plus.
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-[14px] font-semibold sm:inline-flex">
        Voir le détail <Icon name="arrowRight" size={15} />
      </span>
    </Link>
  );
}
