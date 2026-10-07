import type { Metadata } from "next";

import { MenuManager } from "@/components/admin/MenuManager";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { getAdminData, requireOwnerVenue } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";

export const metadata: Metadata = { title: "La carte · Espace gérant" };

export default async function AdminMenuPage() {
  const venue = await requireOwnerVenue();
  let data;
  try {
    data = await getAdminData(venue.id);
  } catch (error) {
    return <ErreurTechnique hint={adminErrorMessage(error as { message?: string })} />;
  }
  return <MenuManager venueId={venue.id} categories={data.categories} stockItems={data.stock_items ?? []} />;
}
