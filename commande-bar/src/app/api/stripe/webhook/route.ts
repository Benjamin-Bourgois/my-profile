import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripeWebhookSecret } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Messages envoyés par Stripe. C'est ICI, et seulement ici, qu'une commande
 * payée en ligne devient « Payée » et apparaît à l'écran du bar.
 * Événements à cocher dans Stripe : checkout.session.completed,
 * checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
 * checkout.session.expired.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("signature absente");
    event = getStripe().webhooks.constructEvent(payload, signature, stripeWebhookSecret());
  } catch (error) {
    console.error("Webhook Stripe refusé (signature invalide : vérifie STRIPE_WEBHOOK_SECRET)", error);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const admin = getAdminClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.payment_status === "unpaid") break; // paiement différé : on attend « async_payment_succeeded »
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (!orderId) break;
      const { data: confirmed, error } = await admin.rpc("confirm_online_payment", {
        p_order_id: orderId,
        p_session_id: session.id,
        p_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
        p_amount_cents: session.amount_total ?? -1,
      });
      // En cas d'erreur, Stripe renverra le message plus tard.
      if (error) {
        console.error("Confirmation de paiement impossible", error);
        return NextResponse.json({ error: "Erreur base" }, { status: 500 });
      }
      if (!confirmed) console.warn(`Paiement ${session.id} : commande ${orderId} déjà confirmée ou montant différent`);
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const { error } = await admin.rpc("cancel_pending_online_order", { p_session_id: event.data.object.id });
      if (error) {
        console.error("Annulation de commande impossible", error);
        return NextResponse.json({ error: "Erreur base" }, { status: 500 });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
