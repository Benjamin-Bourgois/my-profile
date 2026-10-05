import type { Metadata } from "next";
import Link from "next/link";

import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { MessageScreen } from "@/components/MessageScreen";
import { OrderTracker } from "@/components/order/OrderTracker";
import { diagnose } from "@/lib/diagnose";
import { missingConfig } from "@/lib/env";
import { getMenu } from "@/lib/menu";
import { getCustomerOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suivi de commande",
  robots: { index: false, follow: false },
};

export default async function OrderPage(props: PageProps<"/t/[token]/commande/[orderId]">) {
  const { token, orderId } = await props.params;

  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  let order, menu;
  try {
    [order, menu] = await Promise.all([getCustomerOrder(orderId, token), getMenu(token)]);
  } catch (error) {
    console.error("Lecture de la commande impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }

  if (!order) {
    return (
      <MessageScreen icon="🔎" title="Commande introuvable">
        <p>Demandez au serveur, il va vous aider.</p>
        {menu && (
          <Link href={`/t/${token}`} className="mt-6 inline-block font-semibold text-stone-900 underline">
            Retour à la carte
          </Link>
        )}
      </MessageScreen>
    );
  }

  return <OrderTracker initialOrder={order} token={token} venueName={menu?.venue.name ?? null} canReorder={!!menu} />;
}
