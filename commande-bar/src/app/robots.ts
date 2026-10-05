import type { MetadataRoute } from "next";

// Les pages des tables, du bar et de l'admin ne doivent jamais apparaître dans Google.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/t/", "/bar", "/admin", "/connexion", "/api/"] },
  };
}
