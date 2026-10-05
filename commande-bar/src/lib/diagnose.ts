// Traduit une erreur technique en piste concrète, pour aider à la mise en
// route. Le détail affiché ne contient jamais de clé secrète.

type MaybeError = { message?: unknown; code?: unknown } | null | undefined;

export function diagnose(error: unknown): string {
  const e = error as MaybeError;
  const message = String(e?.message ?? error ?? "");
  const code = String(e?.code ?? "");
  return `${hint(message, code)}\n\nDétail : ${detail(message, code)}`;
}

function hint(message: string, code: string): string {
  if (/invalid supabaseurl|invalid url|valid http/i.test(message)) {
    return "L'adresse Supabase est mal écrite : NEXT_PUBLIC_SUPABASE_URL doit ressembler à https://xxxx.supabase.co.";
  }
  if (/no route matched|<html|not found/i.test(message)) {
    return "L'adresse Supabase ne mène pas à ta base : NEXT_PUBLIC_SUPABASE_URL doit être la « Project URL » (https://xxxx.supabase.co), pas une autre page.";
  }
  if (/invalid api key|no api key|unregistered api key|api key|jwt|jws/i.test(message)) {
    return "La clé Supabase est refusée : vérifie SUPABASE_SECRET_KEY dans Vercel (Settings → Environment Variables). Elle doit venir du même projet Supabase que l'adresse.";
  }
  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return "La base n'est pas installée : exécute le script supabase/1-structure.sql dans Supabase (SQL Editor).";
  }
  if (code === "42501" || /permission denied/i.test(message)) {
    return "Accès refusé par la base : SUPABASE_SECRET_KEY doit être la clé « secret » (et non la clé « publishable »).";
  }
  if (code === "PGRST002" || /schema cache/i.test(message)) {
    return "Supabase est en train de démarrer : réessaie dans une minute.";
  }
  if (/fetch failed|enotfound|econnrefused|getaddrinfo/i.test(message)) {
    return "Supabase est injoignable : vérifie NEXT_PUBLIC_SUPABASE_URL (https://xxxx.supabase.co). Si le projet Supabase est en pause, réactive-le.";
  }
  return "Erreur technique inattendue.";
}

function detail(message: string, code: string): string {
  const text = message
    .replace(/<[^>]*>/g, " ")
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, "sb_$1_…")
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return [code, text].filter(Boolean).join(" · ") || "aucun";
}
