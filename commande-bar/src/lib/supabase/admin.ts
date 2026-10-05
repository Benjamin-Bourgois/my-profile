import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseSecretKey, supabaseUrl } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Client Supabase « serveur » (clé secrète). Utilisé uniquement par le
 * serveur de l'application pour les clients du bar, qui n'ont aucun accès
 * direct à la base : toutes les vérifications sont faites dans les
 * fonctions SQL (get_menu, create_order…).
 */
export function getAdminClient(): SupabaseClient {
  client ??= createClient(supabaseUrl, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      // Toujours des données fraîches (disponibilité des produits, statut des commandes…)
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return client;
}
