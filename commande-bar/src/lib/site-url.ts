import "server-only";

import { headers } from "next/headers";

/**
 * Adresse publique du site, utilisée dans les liens des cartes NFC et les QR codes.
 * Priorité : SITE_URL (à régler si vous avez votre propre nom de domaine),
 * puis le domaine de production Vercel, puis l'adresse de la page en cours.
 */
export async function siteUrl(): Promise<string> {
  const configured = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (production) return `https://${production}`;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export function tableUrl(base: string, token: string): string {
  return `${base}/t/${token}`;
}
