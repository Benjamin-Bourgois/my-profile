// Tapigo — Connexion du compte Stripe d'un restaurant (gérant uniquement).
//
// POST { restaurant_id, action: "status" | "onboard" }
//   status  : état du compte (relu chez Stripe) + paiement en ligne activé ou non
//   onboard : crée le compte Stripe du restaurant si besoin et renvoie { url }
//             vers le formulaire Stripe (identité, IBAN…). Retour sur kitchen.html.
//
// Tapigo ne prend aucune commission : le restaurant encaisse sur SON compte
// Stripe et ne paie que les frais Stripe.
import { admin, body, callerRole, HttpError, json, serve, siteUrl, UUID } from "../_shared/util.ts";
import { stripe } from "../_shared/stripe.ts";

interface Account {
  id: string;
  charges_enabled: boolean;
  details_submitted: boolean;
}

serve(async (req) => {
  const { restaurant_id, action } = await body<{ restaurant_id?: string; action?: string }>(req);
  if (!restaurant_id || !UUID.test(restaurant_id)) throw new HttpError(400, "Restaurant manquant");
  const db = admin();
  const role = await callerRole(db, req, restaurant_id);
  if (role !== "owner" && role !== "admin") throw new HttpError(403, "Réservé au gérant du restaurant.");

  const { data: resto } = await db.from("restaurants").select("id, slug, info, online_payment")
    .eq("id", restaurant_id).maybeSingle();
  if (!resto) throw new HttpError(404, "Restaurant introuvable");
  const { data: pay } = await db.from("restaurant_payments").select("*")
    .eq("restaurant_id", restaurant_id).maybeSingle();

  const save = async (acct: Account) => {
    await db.from("restaurant_payments").upsert({
      restaurant_id,
      stripe_account_id: acct.id,
      charges_enabled: acct.charges_enabled,
      details_submitted: acct.details_submitted,
      updated_at: new Date().toISOString(),
    });
    if (!acct.charges_enabled && resto.online_payment) {
      await db.from("restaurants").update({ online_payment: false }).eq("id", restaurant_id);
      resto.online_payment = false;
    }
  };

  if (action === "status") {
    if (!pay?.stripe_account_id) return json({ connected: false, charges_enabled: false, online_payment: false });
    const acct = await stripe<Account>(`accounts/${pay.stripe_account_id}`);
    await save(acct);
    return json({
      connected: true,
      charges_enabled: acct.charges_enabled,
      details_submitted: acct.details_submitted,
      online_payment: resto.online_payment,
    });
  }

  if (action === "onboard") {
    let accountId = pay?.stripe_account_id as string | undefined;
    if (!accountId) {
      // Compte « Standard » : le restaurant a son propre tableau de bord Stripe,
      // reçoit les virements directement et gère ses remboursements.
      const acct = await stripe<Account>("accounts", {
        type: "standard",
        country: "FR",
        default_currency: "eur",
        business_profile: { name: resto.info?.name || resto.slug },
        metadata: { tapigo_restaurant: restaurant_id, tapigo_slug: resto.slug },
      });
      accountId = acct.id;
      await save(acct);
    }
    const site = siteUrl(req);
    const link = await stripe<{ url: string }>("account_links", {
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${site}/kitchen.html?r=${resto.slug}&stripe=relance`,
      return_url: `${site}/kitchen.html?r=${resto.slug}&stripe=retour`,
    });
    return json({ url: link.url });
  }

  throw new HttpError(400, "Action inconnue");
});
