import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/SettingsForm";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { getAdminData, requireOwnerVenue } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";
import { isStripeConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Réglages · Espace gérant" };

export default async function AdminSettingsPage() {
  const venue = await requireOwnerVenue();
  let data;
  try {
    data = await getAdminData(venue.id);
  } catch (error) {
    return <ErreurTechnique hint={adminErrorMessage(error as { message?: string })} />;
  }
  return <SettingsForm settings={data.venue} stripeConfigured={isStripeConfigured()} />;
}
