import { STAFF_PAYMENT_LABEL } from "@/lib/order-types";
import { currentVenue, getStaffSession } from "@/lib/staff";
import { getServerClient } from "@/lib/supabase/server";

type ExportedOrder = {
  business_date: string;
  time: string;
  order_number: number;
  table_label: string;
  items: string | null;
  total_cents: number;
  tip_cents: number;
  payment_method: "online" | "staff";
  payment_status: "paid" | "unpaid";
  staff_payment?: "cash" | "card" | "mixed" | null;
  status: string;
  comment: string | null;
};

const STATUS: Record<string, string> = {
  received: "Reçue",
  preparing: "En préparation",
  served: "Servie",
  cancelled: "Annulée",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Montant au format des tableurs français : 12,50 */
const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * Cellule CSV (séparateur « ; » pour Excel en français). Une cellule qui
 * commence par = + - @ est neutralisée : un commentaire de client ne peut pas
 * devenir une formule dans le tableur.
 */
function cell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Commandes d'une période en CSV, pour la comptabilité (réservé au gérant). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("du");
  const to = params.get("au");
  const session = await getStaffSession().catch(() => null);
  const venue = session ? await currentVenue(session.venues, (v) => v.role === "owner") : undefined;
  if (!venue) return new Response("Accès réservé au gérant", { status: 403 });

  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("admin_export_orders", {
    p_venue_id: venue.id,
    p_from: from && ISO_DATE.test(from) ? from : null,
    p_to: to && ISO_DATE.test(to) ? to : null,
  });
  if (error) {
    console.error("Export des commandes impossible", error);
    return new Response("Export impossible. Vérifiez que le script supabase/6-statistiques.sql a été exécuté.", { status: 500 });
  }

  const orders = (data ?? []) as ExportedOrder[];
  const lines = [
    ["Date", "Heure", "N°", "Table", "Articles", "Total (€)", "Pourboire (€)", "Paiement", "Règlement au serveur", "Payée", "Statut", "Commentaire"],
    ...orders.map((o) => [
      o.business_date,
      o.time,
      o.order_number,
      o.table_label,
      o.items,
      euros(o.total_cents),
      euros(o.tip_cents),
      o.payment_method === "online" ? "En ligne" : "Au bar",
      o.staff_payment ? STAFF_PAYMENT_LABEL[o.staff_payment] : "",
      o.payment_status === "paid" ? "Oui" : "Non",
      STATUS[o.status] ?? o.status,
      o.comment,
    ]),
  ];
  // BOM : Excel reconnaît l'UTF-8 (accents corrects)
  const csv = "﻿" + lines.map((line) => line.map(cell).join(";")).join("\r\n") + "\r\n";
  const range = orders.length ? `${orders[0].business_date}-au-${orders[orders.length - 1].business_date}` : "vide";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${range}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
