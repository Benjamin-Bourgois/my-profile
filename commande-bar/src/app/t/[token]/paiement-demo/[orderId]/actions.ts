"use server";

import { redirect } from "next/navigation";

import { isStripeConfigured } from "@/lib/env";
import { TOKEN_PATTERN } from "@/lib/menu";
import { UUID_PATTERN } from "@/lib/order-types";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Paiement de démonstration : le client valide (« payer ») ou annule.
 * La base vérifie le lien de la table, que le bar est marqué « Démo » et que la
 * commande attend ce paiement simulé ; avec Stripe connecté, rien n'est simulé.
 */
export async function finishDemoPayment(token: string, orderId: string, formData: FormData) {
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(orderId)) redirect("/");
  const paid = formData.get("choix") === "payer";
  const orderPage = `/t/${token}/commande/${orderId}`;
  if (isStripeConfigured()) redirect(orderPage);

  const { data: done, error } = await getAdminClient().rpc("finish_demo_payment", {
    p_token: token,
    p_order_id: orderId,
    p_paid: paid,
  });
  if (error) console.error("Paiement de démonstration non enregistré", error);
  if (done !== true) redirect(orderPage);
  // Payé : suivi de la commande (le panier est vidé). Annulé : retour au panier, toujours rempli.
  redirect(paid ? `${orderPage}?paiement=ok` : `/t/${token}?panier=1`);
}
