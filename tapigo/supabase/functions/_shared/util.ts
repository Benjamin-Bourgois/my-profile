// Outils communs aux fonctions serveur Tapigo (Supabase Edge Functions).
import { createClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Gère CORS + erreurs : chaque fonction n'écrit que sa logique.
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Erreur serveur, réessayez dans un instant." }, 500);
    }
  });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Configuration manquante : secret ${name}`);
  return v;
}

// Client « service_role » : contourne les règles d'accès, à n'utiliser
// qu'après avoir vérifié les droits de l'appelant.
export function admin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Db = ReturnType<typeof admin>;

// Rôle du compte connecté sur ce restaurant : 'admin' | 'owner' | 'equipe' | null.
export async function callerRole(db: Db, req: Request, restaurantId: string): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const uid = data.user.id;
  const { data: adm } = await db.from("admins").select("user_id").eq("user_id", uid).maybeSingle();
  if (adm) return "admin";
  const { data: m } = await db.from("restaurant_members").select("role")
    .eq("restaurant_id", restaurantId).eq("user_id", uid).maybeSingle();
  return m ? m.role : null;
}

// Adresse publique du site (pages de retour après Stripe).
export function siteUrl(req: Request): string {
  const fixed = Deno.env.get("SITE_URL");
  if (fixed) return fixed.replace(/\/+$/, "");
  const origin = req.headers.get("Origin");
  if (origin) return origin;
  throw new HttpError(500, "Configuration manquante : secret SITE_URL");
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    throw new HttpError(400, "Requête invalide");
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
