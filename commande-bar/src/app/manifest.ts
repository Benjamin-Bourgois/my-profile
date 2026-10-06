import type { MetadataRoute } from "next";

// Permet d'ajouter l'écran du bar sur l'écran d'accueil de la tablette
// (« Partager → Sur l'écran d'accueil ») : il s'ouvre alors en plein écran.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Commande à table — Écran du bar",
    short_name: "Bar",
    description: "Les commandes des tables, en temps réel.",
    start_url: "/bar",
    display: "standalone",
    background_color: "#1c1917",
    theme_color: "#1c1917",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
