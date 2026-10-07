import type { Metadata } from "next";

import { CarteNonReconnue } from "@/components/CarteNonReconnue";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { MessageScreen } from "@/components/MessageScreen";
import { MenuOrder } from "@/components/menu/MenuOrder";
import { diagnose } from "@/lib/diagnose";
import { isStripeConfigured, missingConfig } from "@/lib/env";
import { getMenu, getStaffPaymentOptions, getSuggestions, isTableVenueSuspended, type Menu } from "@/lib/menu";
import type { StaffPaymentOptions } from "@/lib/order-types";
import type { Suggestions } from "@/lib/suggestions";

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
  const { panier } = await props.searchParams;

  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  let menu: Menu | null;
  let suspended: boolean;
  let suggestions: Suggestions | null;
  let staffOptions: StaffPaymentOptions | null;
  try {
    [menu, suspended, suggestions, staffOptions] = await Promise.all([
      getMenu(token),
      isTableVenueSuspended(token),
      getSuggestions(token),
      getStaffPaymentOptions(token),
    ]);
  } catch (error) {
    console.error("Lecture de la carte impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }

  if (suspended) {
    return (
      <MessageScreen icon="glass" eyebrow={menu?.venue.name} title="Service indisponible">
        <p>La commande à table n&apos;est pas disponible dans cet établissement pour le moment. Adressez-vous au personnel.</p>
      </MessageScreen>
    );
  }
  if (!menu) return <CarteNonReconnue />;
  const payment = {
    staff: menu.venue.pay_to_staff_enabled,
    online: menu.venue.online_payment_enabled && isStripeConfigured(),
    // Espèces / carte au serveur (null : pas de choix à faire)
    staffOptions,
  };
  return <MenuOrder menu={menu} token={token} payment={payment} suggestions={suggestions} openCart={panier === "1"} />;
}
