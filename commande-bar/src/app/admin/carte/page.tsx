import type { Metadata } from "next";

import { MenuManager } from "@/components/admin/MenuManager";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { getAdminData, requireOwnerVenue } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "La carte · Espace gérant" };

export default async function AdminMenuPage() {
  const venue = await requireOwnerVenue();
  let data;
  try {
    data = await getAdminData(venue.id);
  } catch (error) {
    return <ErreurTechnique hint={adminErrorMessage(error as { message?: string })} />;
  }
  // Suggestions choisies par le gérant (absentes si le script 10 n'a pas été exécuté)
  const { data: suggestions } = await (await getServerClient()).rpc("admin_get_suggestions", { p_venue_id: venue.id });
  const pairings = (suggestions as { pairings: Record<string, string[]> } | null)?.pairings ?? null;
  return <MenuManager venueId={venue.id} categories={data.categories} stockItems={data.stock_items ?? []} pairings={pairings} />;
}
