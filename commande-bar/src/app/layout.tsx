import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";

// Polices de la charte Tapigo, hébergées par le site (rien n'est demandé à Google
// depuis le téléphone du client).
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: "600",
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Commande à table",
  description: "Vos clients commandent et paient depuis leur table, sans application.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF9F5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${cormorant.variable} ${manrope.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
