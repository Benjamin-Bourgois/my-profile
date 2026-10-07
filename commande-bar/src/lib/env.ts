// Lecture des variables d'environnement (configurées dans Vercel, ou dans
// le fichier .env.local pour travailler sur son ordinateur).
// Les erreurs de copier-coller courantes sont corrigées automatiquement :
// espaces, guillemets, « Bearer » devant une clé, adresse sans https://…

function clean(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^["'](.*)["']$/, "$1")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

/**
 * Ramène l'adresse Supabase à la forme attendue « https://xxxx.supabase.co » :
 * ajoute https:// s'il manque, retire ce qui suit le nom de domaine
 * (/rest/v1…), et accepte l'adresse du tableau de bord
 * (supabase.com/dashboard/project/xxxx).
 */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  let value = clean(raw);
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    const dashboard = /(^|\.)supabase\.com$/i.test(url.hostname)
      ? url.pathname.match(/\/project\/([a-z0-9]+)/i)
      : null;
    if (dashboard) return `https://${dashboard[1].toLowerCase()}.supabase.co`;
    return url.origin;
  } catch {
    return value;
  }
}

export const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Nouvelle clé « publishable » de Supabase, ou ancienne clé « anon ».
export const supabasePublishableKey = clean(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** Variables indispensables qui manquent (vide = tout est en place). */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabasePublishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (typeof window === "undefined" && !supabaseSecretKey()) missing.push("SUPABASE_SECRET_KEY");
  return missing;
}

/** Clé secrète Supabase : uniquement côté serveur, jamais envoyée au téléphone. */
export function supabaseSecretKey(): string {
  return clean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Clé API Stripe, uniquement côté serveur : de préférence une clé restreinte
 * (rk_test_…, permission « Checkout Sessions : écriture »), sinon la clé secrète (sk_test_…).
 */
export function stripeSecretKey(): string {
  return clean(process.env.STRIPE_SECRET_KEY);
}

/** Secret de signature du webhook Stripe (whsec_…) : prouve qu'un message vient bien de Stripe. */
export function stripeWebhookSecret(): string {
  return clean(process.env.STRIPE_WEBHOOK_SECRET);
}

/** Paiement en ligne disponible ? (les deux réglages Stripe sont renseignés) */
export function isStripeConfigured(): boolean {
  return stripeSecretKey().length > 0 && stripeWebhookSecret().length > 0;
}

/**
 * Clé API Anthropic (sk-ant-…), uniquement côté serveur : lecture des bons de
 * livraison par l'IA. Facultative : sans elle, le reste du site fonctionne.
 */
export function anthropicApiKey(): string {
  return clean(process.env.ANTHROPIC_API_KEY);
}

/** Lecture des bons de livraison disponible ? */
export function isScanConfigured(): boolean {
  return anthropicApiKey().length > 0;
}
