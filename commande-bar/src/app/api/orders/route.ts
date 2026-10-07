import { NextResponse } from "next/server";

import { cancelUnstartedCheckout, startCheckout } from "@/lib/checkout";
import { isStripeConfigured } from "@/lib/env";
import { GENERIC_ORDER_ERROR, isKnownOrderError, orderError } from "@/lib/order-errors";
import { MAX_COMMENT_LENGTH, MAX_QUANTITY_PER_LINE, MAX_TIP_CENTS, UUID_PATTERN, type PaymentMethod } from "@/lib/order-types";
import { getMenu, TOKEN_PATTERN } from "@/lib/menu";
import { getCustomerOrder } from "@/lib/orders";
import { getAdminClient } from "@/lib/supabase/admin";

type OrderRequest = {
  token: string;
  items: { product_id: string; quantity: number }[];
  comment: string | null;
  payment_method: PaymentMethod;
  tip_cents: number;
};

/** Vérifie la forme de la demande. Les prix ne sont jamais lus : la base les recalcule. */
function parse(body: unknown): OrderRequest | null {
  if (!body || typeof body !== "object") return null;
  const { token, items, comment, payment_method, tip_cents = 0 } = body as Record<string, unknown>;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  if (payment_method !== "staff" && payment_method !== "online") return null;
  if (comment != null && (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH)) return null;
  if (!Number.isInteger(tip_cents) || (tip_cents as number) < 0 || (tip_cents as number) > MAX_TIP_CENTS) return null;
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) return null;
  const lines = items.map((item) => ({
    product_id: (item as Record<string, unknown>)?.product_id,
    quantity: (item as Record<string, unknown>)?.quantity,
  }));
  const valid = lines.every(
    (line) =>
      typeof line.product_id === "string" &&
      UUID_PATTERN.test(line.product_id) &&
      Number.isInteger(line.quantity) &&
      (line.quantity as number) >= 1 &&
      (line.quantity as number) <= MAX_QUANTITY_PER_LINE,
  );
  if (!valid) return null;
  return {
    token,
    items: lines as OrderRequest["items"],
    comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
    payment_method,
    // Pourboire : seulement avec le paiement en ligne (la base le vérifie aussi)
    tip_cents: payment_method === "online" ? (tip_cents as number) : 0,
  };
}

/** Nouvelle commande envoyée depuis le téléphone d'un client. */
export async function POST(request: Request) {
  const order = parse(await request.json().catch(() => null));
  if (!order) {
    return NextResponse.json({ error: orderError("PANIER_INVALIDE").message, code: "PANIER_INVALIDE" }, { status: 400 });
  }
  if (order.payment_method === "online" && !isStripeConfigured()) {
    return NextResponse.json({ error: orderError("PAIEMENT_INDISPONIBLE").message, code: "PAIEMENT_INDISPONIBLE" }, { status: 400 });
  }

  const { data, error } = await getAdminClient().rpc("create_order", {
    p_token: order.token,
    p_items: order.items,
    p_comment: order.comment,
    p_payment_method: order.payment_method,
    p_tip_cents: order.tip_cents,
  });

  if (error) {
    const code = isKnownOrderError(error.message) ? error.message : "ERREUR";
    if (code === "ERREUR") console.error("Création de commande impossible", error);
    const { status, message } = orderError(code, error.details);
    return NextResponse.json({ error: message, code }, { status });
  }

  const created = data as { id: string; order_number: number } | null;
  if (!created) return NextResponse.json({ error: GENERIC_ORDER_ERROR, code: "ERREUR" }, { status: 500 });

  if (order.payment_method === "online") {
    try {
      const [savedOrder, menu] = await Promise.all([getCustomerOrder(created.id, order.token), getMenu(order.token)]);
      if (!savedOrder || !menu) throw new Error("Commande introuvable juste après sa création");
      const checkoutUrl = await startCheckout({
        order: savedOrder,
        token: order.token,
        origin: new URL(request.url).origin,
        venueName: menu.venue.name,
      });
      return NextResponse.json({ id: created.id, order_number: created.order_number, checkout_url: checkoutUrl });
    } catch (checkoutError) {
      console.error("Ouverture du paiement Stripe impossible", checkoutError);
      await cancelUnstartedCheckout(created.id).catch(() => undefined);
      return NextResponse.json(
        { error: "Le paiement en ligne est momentanément indisponible. Choisissez « Payer au serveur » ou réessayez.", code: "STRIPE" },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ id: created.id, order_number: created.order_number });
}
