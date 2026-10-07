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

/* ------------------------------------------------------------------ */
/* Bars et comptes (agency_get_venues / agency_get_venue)              */
/* ------------------------------------------------------------------ */

export type AgencyVenue = {
  id: string;
  name: string;
  created_at: string;
  suspended_at: string | null;
  suspended_note: string | null;
  orders_paused: boolean;
  tables: number;
  members: number;
  owners: string[];
  orders_30d: number;
  revenue_30d_cents: number;
  last_order_at: string | null;
};

export type AgencyMember = {
  user_id: string;
  email: string;
  role: "owner" | "staff";
  added_at: string;
  last_sign_in_at: string | null;
};

export type AgencyVenueDetail = Omit<AgencyVenue, "orders_paused" | "members" | "owners"> & { members: AgencyMember[] };

export const ROLE_LABEL: Record<AgencyMember["role"], string> = { owner: "Gérant", staff: "Équipe" };

/** Résultat d'une action de l'espace agence (affiché sous le formulaire). */
export type AgencyActionResult = {
  error?: string;
  done?: string;
  venueId?: string;
  /** Identifiants à transmettre (mot de passe affiché une seule fois) */
  credentials?: { email: string; password: string; created: boolean };
};

const AGENCY_ERRORS: Record<string, string> = {
  ACCES_REFUSE: "Réservé aux comptes de l'agence.",
  INTROUVABLE: "Bar ou compte introuvable : la page a peut-être été modifiée entre-temps.",
  NOM_INVALIDE: "Le nom du bar est obligatoire (80 caractères maximum).",
  COMPTE_AGENCE: "Ce compte est un compte de l'agence : il a déjà accès à tous les bars.",
};

export function agencyErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const code = error?.message ?? "";
  if (code in AGENCY_ERRORS) return AGENCY_ERRORS[code];
  if (/could not find the function/i.test(code)) {
    return "Base incomplète : exécutez dans Supabase (SQL Editor) le script supabase/9-gestion-des-bars.sql (après le 8).";
  }
  if (/jwt|token/i.test(`${error?.code} ${code}`)) return "Session expirée : reconnectez-vous.";
  return "L'opération n'a pas pu être enregistrée. Réessayez.";
}
