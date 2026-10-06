import "server-only";

import Stripe from "stripe";

import { stripeSecretKey } from "@/lib/env";

let client: Stripe | undefined;

/** Client Stripe (créé à la demande : la clé n'existe pas pendant la construction du site). */
export function getStripe(): Stripe {
  client ??= new Stripe(stripeSecretKey(), { maxNetworkRetries: 2, timeout: 20_000, ...localTestServer() });
  return client;
}

/** STRIPE_API_URL : uniquement pour les tests automatiques (faux Stripe local). Jamais en ligne. */
function localTestServer(): Partial<Stripe.StripeConfig> {
  const raw = process.env.STRIPE_API_URL;
  if (!raw || process.env.VERCEL) return {};
  const url = new URL(raw);
  return { host: url.hostname, port: Number(url.port), protocol: url.protocol === "http:" ? "http" : "https" };
}
