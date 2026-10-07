"use client";

import { useFormStatus } from "react-dom";

/** Boutons du paiement simulé, bloqués pendant l'envoi (pas de double paiement). */
export function DemoPayButtons({ amount }: { amount: string }) {
  const { pending, data } = useFormStatus();
  const paying = pending && data?.get("choix") === "payer";
  return (
    <div className="grid gap-2">
      <button type="submit" name="choix" value="payer" disabled={pending} className="btn btn--primary btn--block">
        {paying ? "Paiement…" : `Payer ${amount}`}
      </button>
      <button type="submit" name="choix" value="annuler" disabled={pending} className="btn btn--ghost btn--block">
        Annuler et revenir au panier
      </button>
    </div>
  );
}
