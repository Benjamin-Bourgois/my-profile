// Appels à l'API Stripe (sans SDK : simple fetch, compatible Deno).
import { env, HttpError } from "./util.ts";

type Params = Record<string, unknown>;

// { a: { b: [ { c: 1 } ] } } -> a[b][0][c]=1 (format attendu par Stripe)
function encode(params: Params, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (x !== null && typeof x === "object") encode(x as Params, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(x));
      });
    } else if (typeof v === "object") {
      encode(v as Params, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

export interface StripeError {
  message?: string;
  code?: string;
}

// account : identifiant du compte Stripe du restaurant (acct_…). Les paiements
// sont créés directement sur ce compte : l'argent va au restaurant.
export async function stripe<T = Record<string, unknown>>(
  path: string,
  params: Params | null = null,
  opts: { account?: string; method?: "GET" | "POST" } = {},
): Promise<T> {
  const method = opts.method || (params ? "POST" : "GET");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
    "Stripe-Version": "2024-06-20",
  };
  if (opts.account) headers["Stripe-Account"] = opts.account;
  // STRIPE_API_BASE : uniquement pour les tests (ex. stripe-mock).
  let url = `${Deno.env.get("STRIPE_API_BASE") || "https://api.stripe.com"}/v1/${path}`;
  let payload: string | undefined;
  if (params && method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = encode(params).toString();
  } else if (params) {
    url += "?" + encode(params).toString();
  }
  const res = await fetch(url, { method, headers, body: payload });
  const data = await res.json();
  if (!res.ok) {
    const e = (data && data.error) as StripeError | undefined;
    console.error("Stripe", path, res.status, e);
    const err = new HttpError(502, e?.message || "Stripe ne répond pas, réessayez.");
    (err as HttpError & { code?: string }).code = e?.code;
    throw err;
  }
  return data as T;
}

// Vérifie la signature « Stripe-Signature » d'un webhook (HMAC SHA-256).
export async function verifyWebhook(payload: string, header: string | null, secret: string, toleranceSec = 300): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
