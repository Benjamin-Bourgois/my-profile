"use client";

import { useActionState } from "react";

import { setDemoPayment } from "@/app/agence/actions";
import { Icon } from "@/components/Icon";
import type { AgencyActionResult } from "@/lib/agency";

/** Bar de démonstration : « Payer en ligne » simulé tant que Stripe n'est pas connecté. */
export function DemoCard({
  venueId,
  venueName,
  enabled,
  available,
  stripeConfigured,
}: {
  venueId: string;
  venueName: string;
  enabled: boolean;
  /** false : base sans le script 12 */
  available: boolean;
  stripeConfigured: boolean;
}) {
  const [state, action, pending] = useActionState<AgencyActionResult, FormData>(setDemoPayment, {});

  return (
    <section aria-labelledby="demo" className={`card !p-5 ${enabled ? "!border-gold" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="demo" className="mr-auto text-[22px]">
          Démonstration
        </h3>
        {enabled && (
          <span className="badge badge--gold">
            <Icon name="sparkle" size={12} />
            Démo
          </span>
        )}
      </div>
      <p className="mt-2 text-ink-2">
        Pour montrer l&apos;application à un prospect : les clients de ce bar peuvent « Payer en ligne » même sans Stripe, sur une page de
        paiement simulée (aucun argent débité). La commande arrive au bar « Payé en ligne · démo ».
      </p>
      {stripeConfigured && (
        <p className="mt-2 text-[14px] text-ink-2">
          Stripe est connecté : les paiements en ligne sont réels dans tous les bars, la simulation n&apos;est plus utilisée.
        </p>
      )}

      {!available ? (
        <p className="mt-3 rounded-md bg-warn-soft px-4 py-3 text-[14px] text-warn-ink">
          Exécutez dans Supabase (SQL Editor) le script supabase/12-paiement-demo.sql pour activer cette option.
        </p>
      ) : (
        <form
          action={action}
          onSubmit={(e) => {
            if (enabled) return;
            const ok = window.confirm(
              `Marquer « ${venueName} » comme bar de démonstration ?\n\nSans Stripe, ses clients pourront « payer en ligne » sans être débités. À réserver aux démonstrations : dans un vrai bar, un client pourrait se faire servir sans avoir payé.`,
            );
            if (!ok) e.preventDefault();
          }}
          className="mt-4"
        >
          {!enabled && (
            <p className="mb-3 flex gap-2 text-[14px] text-warn-ink">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              À réserver aux bars de démonstration : dans un vrai bar, un client pourrait se faire servir sans avoir payé.
            </p>
          )}
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="demo" value={enabled ? "0" : "1"} />
          <button type="submit" disabled={pending} className={`btn ${enabled ? "btn--soft" : "btn--primary"}`}>
            <Icon name="sparkle" size={16} />
            {pending ? "Enregistrement…" : enabled ? "Désactiver la démonstration" : "Activer la démonstration"}
          </button>
        </form>
      )}

      {state.error && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {state.error}
        </p>
      )}
      {state.done && (
        <p role="status" className="mt-3 text-[14px] font-semibold text-ok">
          {state.done}
        </p>
      )}
    </section>
  );
}
