import { NextResponse } from "next/server";

import { cancelUnstartedCheckout, startCheckout } from "@/lib/checkout";
import { isStripeConfigured } from "@/lib/env";
import { GENERIC_ORDER_ERROR, isKnownOrderError, orderError } from "@/lib/order-errors";
import {
  MAX_COMMENT_LENGTH,
  MAX_QUANTITY_PER_LINE,
  MAX_TIP_CENTS,
  UUID_PATTERN,
  type PaymentMethod,
  type StaffPayment,
} from "@/lib/order-types";
import { getDemoPayment, getMenu, TOKEN_PATTERN } from "@/lib/menu";
import { getCustomerOrder } from "@/lib/orders";
import { getAdminClient } from "@/lib/supabase/admin";

type OrderRequest = {
  token: string;
  /** `suggestion` : article ajouté grâce à « Souvent pris avec » ou « Une autre tournée ? » */
  items: { product_id: string; quantity: number; suggestion?: "pairing" | "reorder" }[];
  comment: string | null;
  payment_method: PaymentMethod;
  /** Au serveur : espèces, carte ou les deux */
  staff_payment: StaffPayment | null;
  tip_cents: number;
};

const ONLINE_UNAVAILABLE = "Le paiement en ligne est momentanément indisponible. Choisissez « Payer au serveur » ou réessayez.";

/** Vérifie la forme de la demande. Les prix ne sont jamais lus : la base les recalcule. */
function parse(body: unknown): OrderRequest | null {
  if (!body || typeof body !== "object") return null;
  const { token, items, comment, payment_method, staff_payment, tip_cents = 0 } = body as Record<string, unknown>;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  if (payment_method !== "staff" && payment_method !== "online") return null;
  if (comment != null && (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH)) return null;
  if (!Number.isInteger(tip_cents) || (tip_cents as number) < 0 || (tip_cents as number) > MAX_TIP_CENTS) return null;
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) return null;
  const lines = items.map((item) => {
    const suggestion = (item as Record<string, unknown>)?.suggestion;
    return {
      product_id: (item as Record<string, unknown>)?.product_id,
      quantity: (item as Record<string, unknown>)?.quantity,
      suggestion: suggestion === "pairing" || suggestion === "reorder" ? suggestion : undefined,
    };
  });
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
    staff_payment:
      payment_method === "staff" && (staff_payment === "cash" || staff_payment === "card" || staff_payment === "mixed") ? staff_payment : null,
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
  // Sans Stripe, seul un bar de démonstration accepte le paiement en ligne (simulé)
  const demo = order.payment_method === "online" && !isStripeConfigured();
  if (demo && !(await getDemoPayment(order.token))) {
    return NextResponse.json({ error: orderError("PAIEMENT_INDISPONIBLE").message, code: "PAIEMENT_INDISPONIBLE" }, { status: 400 });
  }

  const { data, error } = await getAdminClient().rpc("create_order", {
    p_token: order.token,
    p_items: order.items.map(({ product_id, quantity }) => ({ product_id, quantity })),
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

  // Règlement au serveur choisi (espèces, carte, les deux) : la base vérifie que le bar l'accepte.
  if (order.staff_payment) {
    const { error: paymentError } = await getAdminClient().rpc("set_order_staff_payment", {
      p_token: order.token,
      p_order_id: created.id,
      p_kind: order.staff_payment,
    });
    if (paymentError) console.error("Règlement au serveur non enregistré", paymentError);
  }

  // Ventes générées par l'appli : sans incidence sur la commande si l'enregistrement échoue.
  const suggested = order.items.flatMap((item) => (item.suggestion ? [{ product_id: item.product_id, kind: item.suggestion }] : []));
  if (suggested.length) {
    const { error: suggestionError } = await getAdminClient().rpc("record_suggestions", {
      p_token: order.token,
      p_order_id: created.id,
      p_items: suggested,
    });
    if (suggestionError) console.error("Ventes des suggestions non enregistrées", suggestionError);
  }

  if (demo) {
    const { data: started, error: demoError } = await getAdminClient().rpc("start_demo_payment", {
      p_token: order.token,
      p_order_id: created.id,
    });
    if (demoError || started !== true) {
      console.error("Paiement de démonstration impossible", demoError);
      await cancelUnstartedCheckout(created.id).catch(() => undefined);
      return NextResponse.json({ error: ONLINE_UNAVAILABLE, code: "STRIPE" }, { status: 502 });
    }
    return NextResponse.json({
      id: created.id,
      order_number: created.order_number,
      checkout_url: `/t/${order.token}/paiement-demo/${created.id}`,
    });
  }

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
      return NextResponse.json({ error: ONLINE_UNAVAILABLE, code: "STRIPE" }, { status: 502 });
    }
  }

  return NextResponse.json({ id: created.id, order_number: created.order_number });
}
