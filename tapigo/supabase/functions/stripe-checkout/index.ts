// Tapigo — Paiement d'une commande depuis le téléphone du client.
//
// POST { order_id }                    -> { url }  page de paiement Stripe
//                                         (carte, Apple Pay, Google Pay)
// POST { order_id, action: "cancel" }  -> le client est revenu sans payer :
//                                         la page Stripe est fermée, la
//                                         commande supprimée et le stock rendu.
// POST { order_id, action: "sync" }    -> relit le paiement chez Stripe et
//                                         confirme la commande si elle est payée
//                                         (filet de sécurité si le webhook est perdu).
//
// La commande a été créée par place_order(..., 'online') : prix recalculés en
// base, invisible en cuisine tant que Stripe n'a pas confirmé le paiement
// (voir stripe-webhook). Montants relus en base : le client ne peut rien modifier.
import { admin, body, HttpError, json, serve, siteUrl, UUID } from "../_shared/util.ts";
import { stripe } from "../_shared/stripe.ts";

interface Line {
  name: string;
  qty: number;
  unitPrice: number;
  options?: { group: string; values: string[] }[];
  note?: string;
}

interface Session {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status?: string;
  amount_total?: number;
  payment_intent?: string | null;
}

serve(async (req) => {
  const { order_id, action } = await body<{ order_id?: string; action?: string }>(req);
  if (!order_id || !UUID.test(order_id)) throw new HttpError(400, "Commande manquante");
  const db = admin();

  const { data: order } = await db.from("orders").select("*").eq("id", order_id).maybeSingle();
  if (!order) {
    if (action === "cancel") return json({ cancelled: true });
    throw new HttpError(404, "Commande introuvable ou expirée. Recommencez votre commande.");
  }
  if (order.payment?.status === "paid") return json({ paid: true });
  if (order.payment?.method !== "online" || order.payment?.status !== "awaiting") {
    throw new HttpError(400, "Cette commande se règle sur place.");
  }

  const { data: pay } = await db.from("restaurant_payments").select("stripe_account_id, charges_enabled")
    .eq("restaurant_id", order.restaurant_id).maybeSingle();
  const account = pay?.stripe_account_id as string | undefined;
  const sessionId = order.payment?.session as string | undefined;

  if (action === "sync") {
    if (!sessionId || !account) return json({ pending: true });
    const s = await stripe<Session>(`checkout/sessions/${sessionId}`, null, { account });
    if (s.status === "complete" && s.payment_status === "paid") {
      if (s.amount_total !== Math.round((Number(order.total) + Number(order.tip || 0)) * 100)) {
        throw new HttpError(409, "Montant payé inattendu : vérifiez ce paiement dans Stripe.");
      }
      const { error } = await db.rpc("payment_confirmed", { p_id: order_id, p_ref: String(s.payment_intent || s.id) });
      if (error) throw error;
      return json({ paid: true });
    }
    if (s.status === "expired") {
      await db.rpc("release_awaiting_order", { p_id: order_id });
      return json({ cancelled: true });
    }
    return json({ pending: true });
  }

  if (action === "cancel") {
    if (sessionId && account) {
      try {
        const s = await stripe<Session>(`checkout/sessions/${sessionId}`, null, { account });
        if (s.status === "complete") return json({ paid: true });
        if (s.status === "open") await stripe(`checkout/sessions/${sessionId}/expire`, {}, { account });
      } catch (err) {
        // Paiement peut-être en cours : on ne supprime rien, le webhook tranchera.
        console.error(err);
        return json({ cancelled: false });
      }
    }
    await db.rpc("release_awaiting_order", { p_id: order_id });
    return json({ cancelled: true });
  }

  if (!account || !pay?.charges_enabled) {
    throw new HttpError(400, "Le paiement en ligne n'est pas disponible. Choisissez « Payer à table ».");
  }

  // Le client revient sur la page de paiement déjà ouverte : on la réutilise.
  if (sessionId) {
    const s = await stripe<Session>(`checkout/sessions/${sessionId}`, null, { account });
    if (s.status === "complete") return json({ paid: true });
    if (s.status === "open" && s.url) return json({ url: s.url });
  }

  const { data: resto } = await db.from("restaurants").select("slug, info").eq("id", order.restaurant_id).maybeSingle();
  if (!resto) throw new HttpError(404, "Restaurant introuvable");
  const name = resto.info?.name || "Restaurant";
  const site = siteUrl(req);
  const back = `${site}/menu.html?r=${encodeURIComponent(resto.slug)}`;
  const lines = (order.lines || []) as Line[];

  const session = await stripe<Session>("checkout/sessions", {
    mode: "payment",
    locale: "fr",
    client_reference_id: order_id,
    metadata: { order_id },
    // Délai minimum autorisé par Stripe : la commande est libérée ensuite.
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    success_url: `${back}&paid=${order_id}`,
    cancel_url: `${back}&cancel=${order_id}`,
    payment_intent_data: {
      description: `${name} · table ${order.table_label} · commande n° ${order.number}`,
      metadata: { order_id, table: order.table_label, number: String(order.number) },
    },
    line_items: [...lines.map((l) => {
      const opts = (l.options || []).map((o) => o.values.join(", ")).filter(Boolean).join(" · ");
      return {
        quantity: l.qty,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(Number(l.unitPrice) * 100),
          product_data: { name: l.name, ...(opts ? { description: opts.slice(0, 200) } : {}) },
        },
      };
    }), ...(Number(order.tip) > 0 ? [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: Math.round(Number(order.tip) * 100),
        product_data: { name: "Pourboire pour l'équipe" },
      },
    }] : [])],
  }, { account });

  await db.from("orders").update({ payment: { ...order.payment, session: session.id } }).eq("id", order_id);
  return json({ url: session.url });
});
