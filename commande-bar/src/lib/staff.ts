import "server-only";

import { cache } from "react";

import { getServerClient } from "@/lib/supabase/server";

export type StaffVenue = {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string;
  role: "owner" | "staff";
};

export type StaffUser = { id: string; email: string | null };

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
