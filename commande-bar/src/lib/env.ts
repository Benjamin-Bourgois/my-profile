// Lecture des variables d'environnement (configurées dans Vercel, ou dans
// le fichier .env.local pour travailler sur son ordinateur).
// Les espaces ou retours à la ligne collés par erreur sont ignorés.

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

export const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");

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
