import type { NextConfig } from "next";

import { normalizeSupabaseUrl } from "./src/lib/env";

/** Adresses Supabase (API + temps réel) que le navigateur a le droit de contacter. */
function supabaseSources(): string {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) return "";
  try {
    const { origin, protocol, host } = new URL(url);
    return `${origin} ${protocol === "https:" ? "wss" : "ws"}://${host}`;
  } catch {
    return "";
  }
}

/**
 * Politique de sécurité du contenu : le navigateur ne charge que des scripts du
 * site lui-même, ne parle qu'au site et à Supabase, et refuse d'afficher le site
 * dans une autre page (anti-hameçonnage). Le paiement se fait sur la page Stripe.
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseSources();
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${supabase.split(" ")[0] ?? ""}`,
    `connect-src 'self' ${supabase}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // En développement, Next.js a besoin d'outils que cette politique bloquerait.
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy() }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
