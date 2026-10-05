import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/**
 * Client Supabase au nom de la personne connectée (personnel du bar).
 * Les règles de sécurité de la base s'appliquent : elle ne voit que son bar.
 */
export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis une page : impossible d'écrire les cookies ici,
          // le proxy (src/proxy.ts) s'en charge à la requête suivante.
        }
      },
    },
  });
}
