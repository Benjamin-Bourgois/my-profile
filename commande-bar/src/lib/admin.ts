import "server-only";

import QRCode from "qrcode";
import { redirect } from "next/navigation";

import type { AdminData, TableWithLink } from "@/lib/admin-types";
import { siteUrl, tableUrl } from "@/lib/site-url";
import { getStaffSession, type StaffVenue } from "@/lib/staff";
import { getServerClient } from "@/lib/supabase/server";

/** Bar dont la personne connectée est gérante (le layout /admin a déjà vérifié l'accès). */
export async function requireOwnerVenue(): Promise<StaffVenue> {
  const session = await getStaffSession();
  const venue = session?.venues.find((v) => v.role === "owner");
  if (!venue) redirect("/admin");
  return venue;
}

export async function getAdminData(venueId: string): Promise<AdminData> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("admin_get_data", { p_venue_id: venueId });
  if (error) throw error;
  return data as AdminData;
}

/** Tables avec leur lien complet et leur QR code (SVG). */
export async function withLinks(tables: AdminData["tables"]): Promise<TableWithLink[]> {
  const base = await siteUrl();
  return Promise.all(
    tables.map(async (table) => {
      const url = tableUrl(base, table.token);
      const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return { ...table, url, qrSvg };
    }),
  );
}
