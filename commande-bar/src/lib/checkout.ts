import "server-only";

import type { CustomerOrder } from "@/lib/order-types";
import { getStripe } from "@/lib/stripe";
import { getAdminClient } from "@/lib/supabase/admin";

/** Durée pour payer, au minimum 30 minutes chez Stripe. Ensuite la commande est annulée. */
const CHECKOUT_LIFETIME_SECONDS = 30 * 60;

/**
 * Ouvre la page de paiement Stripe d'une commande en attente de paiement.
 * Les montants viennent de la base (jamais du téléphone). Renvoie l'adresse
 * de la page Stripe vers laquelle envoyer le client.
 */
export async function startCheckout({
  order,
  token,
  origin,
  venueName,
}: {
  order: CustomerOrder;
  token: string;
  origin: string;
  venueName: string;
}): Promise<string> {
  const orderPage = `${origin}/t/${token}/commande/${order.id}`;

  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      locale: "fr",
      submit_type: "pay",
      line_items: order.items
        .filter((item) => item.unit_price_cents > 0) // Stripe refuse les lignes gratuites
        .map((item) => ({
          quantity: item.quantity,
          price_data: { currency: "eur", unit_amount: item.unit_price_cents, product_data: { name: item.name } },
        })),
      custom_text: {
        submit: { message: `${venueName} · ${order.table_label} · commande n° ${order.order_number}` },
      },
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      payment_intent_data: { metadata: { order_id: order.id } },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_LIFETIME_SECONDS,
      success_url: `${orderPage}?paiement=ok`,
      cancel_url: `${orderPage}?paiement=annule`,
    },
    { idempotencyKey: `commande-${order.id}` },
  );

  if (!session.url) throw new Error("Stripe n'a pas renvoyé d'adresse de paiement");

  // Le webhook ne validera le paiement que pour CETTE session Stripe.
  const { error } = await getAdminClient()
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("status", "pending_payment");
  if (error) {
    await getStripe().checkout.sessions.expire(session.id).catch(() => undefined);
    throw error;
  }
  return session.url;
}

/** Commande en ligne dont le paiement n'a pas pu démarrer : on l'annule. */
export async function cancelUnstartedCheckout(orderId: string) {
  await getAdminClient()
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending_payment");
}
