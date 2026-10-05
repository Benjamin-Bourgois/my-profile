import { NextResponse } from "next/server";

import { isStripeConfigured } from "@/lib/env";
import { GENERIC_ORDER_ERROR, isKnownOrderError, orderError } from "@/lib/order-errors";
import { MAX_COMMENT_LENGTH, MAX_QUANTITY_PER_LINE, UUID_PATTERN, type PaymentMethod } from "@/lib/order-types";
import { TOKEN_PATTERN } from "@/lib/menu";
import { getAdminClient } from "@/lib/supabase/admin";

type OrderRequest = {
  token: string;
  items: { product_id: string; quantity: number }[];
  comment: string | null;
  payment_method: PaymentMethod;
};

/** Vérifie la forme de la demande. Les prix ne sont jamais lus : la base les recalcule. */
function parse(body: unknown): OrderRequest | null {
  if (!body || typeof body !== "object") return null;
  const { token, items, comment, payment_method } = body as Record<string, unknown>;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  if (payment_method !== "staff" && payment_method !== "online") return null;
  if (comment != null && (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH)) return null;
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
  });

  if (error) {
    const code = isKnownOrderError(error.message) ? error.message : "ERREUR";
    if (code === "ERREUR") console.error("Création de commande impossible", error);
    const { status, message } = orderError(code);
    return NextResponse.json({ error: message, code }, { status });
  }

  const created = data as { id: string; order_number: number } | null;
  if (!created) return NextResponse.json({ error: GENERIC_ORDER_ERROR, code: "ERREUR" }, { status: 500 });
  return NextResponse.json({ id: created.id, order_number: created.order_number });
}
