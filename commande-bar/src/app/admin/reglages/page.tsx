import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/SettingsForm";
import { SuggestionsSetting } from "@/components/admin/SuggestionsSetting";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { getAdminData, requireOwnerVenue } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";
import { isStripeConfigured } from "@/lib/env";
import type { StaffPaymentOptions } from "@/lib/order-types";
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
  const supabase = await getServerClient();
  const [{ data: suggestions }, { data: paymentOptions }, { data: demoPayment }] = await Promise.all([
    supabase.rpc("admin_get_suggestions", { p_venue_id: venue.id }),
    supabase.rpc("admin_get_payment_options", { p_venue_id: venue.id }), // absent avant le script 11
    supabase.rpc("admin_get_demo_payment", { p_venue_id: venue.id }), // absent avant le script 12
  ]);
  return (
    <div className="space-y-5">
      <SettingsForm
        settings={data.venue}
        stripeConfigured={isStripeConfigured()}
        paymentOptions={(paymentOptions as StaffPaymentOptions | null) ?? null}
        demoPayment={demoPayment === true}
      />
      {suggestions && <SuggestionsSetting venueId={venue.id} enabled={(suggestions as { enabled: boolean }).enabled} />}
    </div>
  );
}
