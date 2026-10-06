import QRCode from "qrcode";

import { getAdminData } from "@/lib/admin";
import { siteUrl, tableUrl } from "@/lib/site-url";
import { getStaffSession } from "@/lib/staff";

/** QR code d'une table en PNG haute définition, à télécharger (réservé au gérant). */
export async function GET(request: Request) {
  const tableId = new URL(request.url).searchParams.get("table") ?? "";
  const session = await getStaffSession().catch(() => null);
  const venue = session?.venues.find((v) => v.role === "owner");
  if (!venue) return new Response("Accès réservé au gérant", { status: 403 });

  const data = await getAdminData(venue.id).catch(() => null);
  const table = data?.tables.find((t) => t.id === tableId);
  if (!table) return new Response("Table introuvable", { status: 404 });

  const png = await QRCode.toBuffer(tableUrl(await siteUrl(), table.token), { width: 1024, margin: 2, errorCorrectionLevel: "M" });
  const fileName = `qr-${table.label}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${fileName}.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
