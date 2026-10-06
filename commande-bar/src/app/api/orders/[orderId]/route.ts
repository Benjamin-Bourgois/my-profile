import { NextResponse } from "next/server";

import { getCustomerOrder } from "@/lib/orders";

/** Statut d'une commande, pour la page de suivi du client (interrogée toutes les 3 s). */
export async function GET(request: Request, context: RouteContext<"/api/orders/[orderId]">) {
  const { orderId } = await context.params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  try {
    const order = await getCustomerOrder(orderId, token);
    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Lecture de commande impossible", error);
    return NextResponse.json({ error: "Erreur technique" }, { status: 500 });
  }
}
