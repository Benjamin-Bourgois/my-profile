// Tapigo — Notifications de Stripe (paiements des clients, comptes restaurants).
//
// À déclarer dans Stripe → Développeurs → Webhooks, en cochant « Événements
// sur les comptes connectés » :
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   checkout.session.async_payment_failed, checkout.session.expired, account.updated
// Le secret de signature (whsec_…) va dans le secret STRIPE_WEBHOOK_SECRET.
import { admin, env, json } from "../_shared/util.ts";
import { verifyWebhook } from "../_shared/stripe.ts";

interface StripeEvent {
  type: string;
  account?: string;
  data: { object: Record<string, unknown> };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const raw = await req.text();
  const ok = await verifyWebhook(raw, req.headers.get("Stripe-Signature"), env("STRIPE_WEBHOOK_SECRET"));
  if (!ok) return json({ error: "Signature invalide" }, 400);

  const event = JSON.parse(raw) as StripeEvent;
  const obj = event.data.object;
  const db = admin();

  // La session doit venir du compte Stripe du restaurant de la commande,
  // et le montant payé correspondre exactement au total calculé en base.
  const orderFor = async () => {
    const id = (obj.client_reference_id || (obj.metadata as Record<string, string> | undefined)?.order_id) as string | undefined;
    if (!id) return null;
    // Erreur de base : on la remonte (réponse 500) pour que Stripe renvoie l'événement.
    const { data: order, error } = await db.from("orders").select("id, restaurant_id, total, tip, payment").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!order) return null;
    const { data: pay, error: payError } = await db.from("restaurant_payments").select("stripe_account_id")
      .eq("restaurant_id", order.restaurant_id).maybeSingle();
    if (payError) throw payError;
    if (!pay || pay.stripe_account_id !== event.account) {
      console.error("Compte Stripe inattendu", event.account, "pour la commande", id);
      return null;
    }
    return order;
  };

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (obj.payment_status !== "paid") break; // paiement différé : on attend la suite
        const order = await orderFor();
        if (!order) break;
        if (Number(obj.amount_total) !== Math.round((Number(order.total) + Number(order.tip || 0)) * 100)) {
          console.error("Montant inattendu", obj.amount_total, "pour", order.id);
          break;
        }
        const { error } = await db.rpc("payment_confirmed", { p_id: order.id, p_ref: String(obj.payment_intent || obj.id) });
        if (error) throw error;
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const order = await orderFor();
        if (order) await db.rpc("release_awaiting_order", { p_id: order.id });
        break;
      }
      case "account.updated": {
        const charges = !!obj.charges_enabled;
        const { data: rows } = await db.from("restaurant_payments")
          .update({ charges_enabled: charges, details_submitted: !!obj.details_submitted, updated_at: new Date().toISOString() })
          .eq("stripe_account_id", String(obj.id)).select("restaurant_id");
        if (!charges && rows?.length) {
          await db.from("restaurants").update({ online_payment: false })
            .in("id", rows.map((r) => r.restaurant_id));
        }
        break;
      }
    }
  } catch (err) {
    console.error(err);
    return json({ error: "Traitement impossible" }, 500); // Stripe renverra l'événement
  }
  return json({ received: true });
});
