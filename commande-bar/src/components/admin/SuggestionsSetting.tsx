"use client";

import { useState } from "react";

import { Toggle } from "@/components/admin/Toggle";
import { useAdminAction } from "@/lib/use-admin-action";

/** Réglage : suggestions aux clients (« Souvent pris avec », « Une autre tournée ? »). */
export function SuggestionsSetting({ venueId, enabled }: { venueId: string; enabled: boolean }) {
  const { run, pending, error } = useAdminAction();
  const [checked, setChecked] = useState(enabled);

  async function change(next: boolean) {
    setChecked(next);
    const result = await run("admin_set_suggestions_enabled", { p_venue_id: venueId, p_enabled: next });
    if (!result.ok) setChecked(!next);
  }

  return (
    <section aria-labelledby="suggestions" className="card max-w-2xl !p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="suggestions" className="text-[22px]">
            Suggestions aux clients
          </h3>
          <p className="mt-1 text-[14px] text-ink-2">
            « Souvent pris avec » dans le panier (d&apos;après vos ventes, ou vos choix dans la fiche de chaque produit) et « Une autre
            tournée ? » un quart d&apos;heure après le service. Ce qu&apos;elles rapportent s&apos;affiche dans les Statistiques.
          </p>
        </div>
        <Toggle checked={checked} onChange={change} label="Suggestions aux clients" disabled={pending} />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
