import type { Metadata } from "next";

import { ErreurTechnique } from "@/components/ErreurTechnique";
import { StaffOrder, type StaffMenu } from "@/components/staff/StaffOrder";
import { adminErrorMessage } from "@/lib/admin-errors";
import { staffPageGuard } from "@/lib/staff-page";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Prise de commande", robots: { index: false } };

/** Un serveur prend la commande d'un client (téléphone ou tablette du personnel). */
export default async function StaffOrderPage() {
  const guard = await staffPageGuard("/bar/commande");
  if ("screen" in guard) return guard.screen;

  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("get_staff_menu", { p_venue_id: guard.venue.id });
  if (error) return <ErreurTechnique hint={adminErrorMessage(error)} />;
  return <StaffOrder venue={guard.venue} initialMenu={data as StaffMenu} />;
}
