import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { getServerClient } from "@/lib/supabase/server";

export type StaffVenue = {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string;
  role: "owner" | "staff";
};

/**
 * Personne connectée et bar(s) auxquels elle a accès,
 * ou `null` si personne n'est connecté.
 */
export const getStaffSession = cache(async (): Promise<{ user: User; venues: StaffVenue[] } | null> => {
  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: venues, error: venuesError } = await supabase.rpc("get_my_venues");
  if (venuesError) throw venuesError;
  return { user: data.user, venues: (venues ?? []) as StaffVenue[] };
});
