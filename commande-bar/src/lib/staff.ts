import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getServerClient } from "@/lib/supabase/server";

export type StaffVenue = {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string;
  orders_paused: boolean;
  role: "owner" | "staff";
  /** Abonnement suspendu par l'agence (absent avant le script 9) */
  suspended?: boolean;
};

export type StaffUser = { id: string; email: string | null };

/** Cookie du bar ouvert, quand un compte a accès à plusieurs bars (l'agence, par exemple). */
export const VENUE_COOKIE = "bar-ouvert";

/**
 * Personne connectée et bar(s) auxquels elle a accès,
 * ou `null` si personne n'est connecté.
 * La session est vérifiée localement (signature du jeton), sans aller-retour
 * vers Supabase Auth : les pages s'affichent plus vite.
 */
export const getStaffSession = cache(async (): Promise<{ user: StaffUser; venues: StaffVenue[] } | null> => {
  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const user: StaffUser = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };

  const { data: venues, error: venuesError } = await supabase.rpc("get_my_venues");
  if (venuesError) throw venuesError;
  return { user, venues: (venues ?? []) as StaffVenue[] };
});

/** La personne connectée est-elle un compte de l'agence (espace /agence) ? */
export const isAgency = cache(async (): Promise<boolean> => {
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("is_agency");
  return !error && data === true;
});

/**
 * Bar ouvert : celui choisi en dernier (cookie), sinon le premier bar actif,
 * sinon le premier. `filter` : par exemple les bars dont la personne est gérante.
 */
export async function currentVenue(venues: StaffVenue[], filter?: (venue: StaffVenue) => boolean): Promise<StaffVenue | undefined> {
  const list = filter ? venues.filter(filter) : venues;
  const chosen = (await cookies()).get(VENUE_COOKIE)?.value;
  return list.find((v) => v.id === chosen) ?? list.find((v) => !v.suspended) ?? list[0];
}
