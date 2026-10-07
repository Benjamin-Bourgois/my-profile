import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
import { MessageScreen } from "@/components/MessageScreen";
import { diagnose } from "@/lib/diagnose";
import { isStripeConfigured } from "@/lib/env";
import { formatPrice } from "@/lib/format";
import { getMenu } from "@/lib/menu";
import { getCustomerOrder } from "@/lib/orders";

import { finishDemoPayment } from "./actions";
import { DemoPayButtons } from "./DemoPayButtons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paiement (démonstration)",
  robots: { index: false, follow: false },
};

/**
 * Page de paiement simulée d'un bar de démonstration, tant que Stripe n'est pas
 * connecté : même parcours qu'un vrai paiement, sans argent débité.
 */
export default async function DemoPaymentPage(props: PageProps<"/t/[token]/paiement-demo/[orderId]">) {
  const { token, orderId } = await props.params;
  const orderPage = `/t/${token}/commande/${orderId}`;
  if (isStripeConfigured()) redirect(orderPage);

  let order, menu;
  try {
    [order, menu] = await Promise.all([getCustomerOrder(orderId, token), getMenu(token)]);
  } catch (error) {
    console.error("Lecture de la commande impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }
  if (!order) {
    return (
      <MessageScreen icon="search" title="Commande introuvable">
        <p>Demandez au serveur, il va vous aider.</p>
      </MessageScreen>
    );
  }
  // Déjà payée, annulée, ou pas un paiement simulé : le suivi de la commande
  if (!order.demo_payment || order.status !== "pending_payment") redirect(orderPage);

  const toPay = order.total_cents + order.tip_cents;

  return (
    <main className="mx-auto min-h-dvh max-w-[480px] px-4 pb-12 pt-8">
      <p className="eyebrow text-center">
        {menu ? `${menu.venue.name} · ` : ""}
        {order.table_label}
      </p>
      <h1 className="mt-1 text-center text-[34px]">Paiement</h1>

      <p className="mt-5 flex gap-2.5 rounded-md bg-warn-soft px-4 py-3 text-[14px] text-warn-ink">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
        <span>
          <strong>Démonstration : aucun argent n&apos;est débité.</strong> Une fois le paiement en ligne activé, le client paie ici par
          carte, Apple Pay ou Google Pay.
        </span>
      </p>

      <section aria-label="Votre commande" className="card mt-4 !p-5">
        <p className="text-[13px] text-muted">Commande n° {order.order_number}</p>
        <ul className="mt-2 divide-y divide-line">
          {order.items.map((item, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 break-words">
                {item.quantity} × {item.name}
              </span>
              <span className="shrink-0 tabular-nums">{formatPrice(item.quantity * item.unit_price_cents)}</span>
            </li>
          ))}
          {order.tip_cents > 0 && (
            <li className="flex items-baseline justify-between gap-3 py-2 text-ink-2">
              <span>Pourboire</span>
              <span className="shrink-0 tabular-nums">{formatPrice(order.tip_cents)}</span>
            </li>
          )}
        </ul>
        <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="font-semibold">Total</span>
          <span className="font-serif text-[28px] font-semibold tabular-nums">{formatPrice(toPay)}</span>
        </p>
      </section>

      <div className="card mt-4 flex items-center gap-3 !p-4" aria-label="Moyen de paiement">
        <span aria-hidden className="grid h-10 w-14 shrink-0 place-items-center rounded-md bg-ink text-sand">
          <Icon name="card" size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Carte de démonstration</p>
          <p className="text-[14px] tabular-nums text-ink-2">•••• •••• •••• 4242</p>
        </div>
      </div>

      <form action={finishDemoPayment.bind(null, token, orderId)} className="mt-6">
        <DemoPayButtons amount={formatPrice(toPay)} />
      </form>
    </main>
  );
}
