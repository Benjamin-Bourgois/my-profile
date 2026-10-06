import type { Metadata } from "next";

import { TablesManager } from "@/components/admin/TablesManager";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { getAdminData, requireOwnerVenue, withLinks } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";

export const metadata: Metadata = { title: "Tables · Espace gérant" };

export default async function AdminTablesPage() {
  const venue = await requireOwnerVenue();
  let data;
  try {
    data = await getAdminData(venue.id);
  } catch (error) {
    return <ErreurTechnique hint={adminErrorMessage(error as { message?: string })} />;
  }
  return <TablesManager venueId={venue.id} tables={await withLinks(data.tables)} />;
}
