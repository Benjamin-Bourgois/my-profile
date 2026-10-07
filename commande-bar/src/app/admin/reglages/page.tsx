import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/SettingsForm";
import { SuggestionsSetting } from "@/components/admin/SuggestionsSetting";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { getAdminData, requireOwnerVenue } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";
import { isStripeConfigured } from "@/lib/env";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Réglages · Espace gérant" };

export default async function AdminSettingsPage() {
  const venue = await requireOwnerVenue();
  let data;
  try {
    data = await getAdminData(venue.id);
  } catch (error) {
    return <ErreurTechnique hint={adminErrorMessage(error as { message?: string })} />;
  }
  // Absent si le script 10 n'a pas été exécuté
  const { data: suggestions } = await (await getServerClient()).rpc("admin_get_suggestions", { p_venue_id: venue.id });
  return (
    <div className="space-y-5">
      <SettingsForm settings={data.venue} stripeConfigured={isStripeConfigured()} />
      {suggestions && <SuggestionsSetting venueId={venue.id} enabled={(suggestions as { enabled: boolean }).enabled} />}
    </div>
  );
}
