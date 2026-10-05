import type { Metadata } from "next";

import { CarteNonReconnue } from "@/components/CarteNonReconnue";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { MenuView } from "@/components/MenuView";
import { diagnose } from "@/lib/diagnose";
import { missingConfig } from "@/lib/env";
import { getMenu, type Menu } from "@/lib/menu";

// La carte doit toujours être à jour (produits indisponibles, table désactivée…).
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/t/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const menu = missingConfig().length ? null : await getMenu(token).catch(() => null);
  return {
    title: menu ? `${menu.venue.name} · ${menu.table.label}` : "Commande à table",
    robots: { index: false, follow: false },
  };
}

export default async function TablePage(props: PageProps<"/t/[token]">) {
  const { token } = await props.params;

  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  let menu: Menu | null;
  try {
    menu = await getMenu(token);
  } catch (error) {
    console.error("Lecture de la carte impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }

  if (!menu) return <CarteNonReconnue />;
  return <MenuView menu={menu} />;
}
