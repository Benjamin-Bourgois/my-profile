// Espace agence : usage de la lecture des bons par bar (renvoyé par agency_get_usage()).

export type AgencyVenueUsage = {
  id: string;
  name: string;
  scans: number;
  read: number;
  applied: number;
  failed: number;
  pages: number;
  input_tokens: number;
  output_tokens: number;
  last_scan_at: string | null;
};

export type AgencyUsage = {
  /** Premier jour du mois affiché (AAAA-MM-01) */
  month: string;
  current_month: string;
  /** Mois avec des lectures, plus le mois en cours, le plus récent d'abord */
  months: string[];
  venues: AgencyVenueUsage[];
};

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** « 2026-10-01 » → « octobre 2026 » */
export function monthLabel(month: string): string {
  return monthFormat.format(new Date(`${month}T12:00:00Z`));
}

/** ?mois=2026-09 → « 2026-09-01 » (null : mois en cours) */
export function parseMonth(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : null;
}

const dollars = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 0.2624 → « 0,26 $ » ; très petit montant → « < 0,01 $ » */
export function formatDollars(amount: number): string {
  if (amount > 0 && amount < 0.005) return "< 0,01 $";
  return `${dollars.format(amount)} $`;
}
