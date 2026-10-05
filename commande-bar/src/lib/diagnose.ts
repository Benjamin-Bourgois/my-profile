// Traduit une erreur technique en piste concrète, pour aider à la mise en
// route (aucune information secrète n'est affichée).

type MaybeError = { message?: unknown; code?: unknown; cause?: unknown } | null | undefined;

export function diagnose(error: unknown): string {
  const e = error as MaybeError;
  const message = String(e?.message ?? error ?? "");
  const code = String(e?.code ?? "");

  if (/invalid api key|no api key|unregistered api key|jwt|apikey/i.test(message)) {
    return "La clé Supabase est refusée : vérifie SUPABASE_SECRET_KEY dans Vercel (Settings → Environment Variables), puis redéploie.";
  }
  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return "La base n'est pas installée : exécute le script supabase/1-structure.sql dans Supabase (SQL Editor).";
  }
  if (code === "42501" || /permission denied/i.test(message)) {
    return "Accès refusé par la base : SUPABASE_SECRET_KEY doit être la clé « secret » (et non la clé « publishable »).";
  }
  if (/fetch failed|enotfound|econnrefused|getaddrinfo|invalid url/i.test(message)) {
    return "Supabase est injoignable : vérifie NEXT_PUBLIC_SUPABASE_URL (de la forme https://xxxx.supabase.co). Si le projet Supabase est en pause, réactive-le.";
  }
  return "Erreur technique inattendue. Le détail est visible dans Vercel → Logs.";
}
