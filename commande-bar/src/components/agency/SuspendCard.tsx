"use client";

import { useActionState } from "react";

import { setSuspended } from "@/app/agence/actions";
import { Icon } from "@/components/Icon";
import type { AgencyActionResult } from "@/lib/agency";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** Abonnement du bar : suspendre (fin d'abonnement, impayé…) ou réactiver. */
export function SuspendCard({
  venueId,
  venueName,
  suspendedAt,
  note,
}: {
  venueId: string;
  venueName: string;
  suspendedAt: string | null;
  note: string | null;
}) {
  const [state, action, pending] = useActionState<AgencyActionResult, FormData>(setSuspended, {});
  const suspended = Boolean(suspendedAt);

  return (
    <section aria-labelledby="abonnement" className={`card !p-5 ${suspended ? "!border-danger" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="abonnement" className="mr-auto text-[22px]">
          Abonnement
        </h3>
        {suspended ? <span className="badge badge--danger">Suspendu</span> : <span className="badge badge--ok">Actif</span>}
      </div>

      {suspended ? (
        <>
          <p className="mt-2 text-ink-2">
            Suspendu depuis le {dateFormat.format(new Date(suspendedAt as string))}
            {note && <> · « {note} »</>}.
          </p>
          <p className="mt-2 text-[14px] text-ink-2">
            Les clients voient « Service indisponible » et ne peuvent plus commander ; l&apos;équipe ne peut plus ouvrir l&apos;écran du
            bar, les stocks ni l&apos;espace gérant. Toutes les données sont conservées.
          </p>
          <form action={action} className="mt-4">
            <input type="hidden" name="venue_id" value={venueId} />
            <input type="hidden" name="suspend" value="0" />
            <button type="submit" disabled={pending} className="btn btn--primary">
              <Icon name="play" size={16} />
              {pending ? "Réactivation…" : "Réactiver le bar"}
            </button>
          </form>
        </>
      ) : (
        <form
          action={action}
          onSubmit={(e) => {
            const ok = window.confirm(
              `Suspendre « ${venueName} » ?\n\n• Les clients ne pourront plus commander ni appeler un serveur.\n• L'équipe et le gérant n'auront plus accès à l'écran du bar, aux stocks ni à l'espace gérant.\n• Les données sont conservées : vous pourrez réactiver le bar à tout moment.`,
            );
            if (!ok) e.preventDefault();
          }}
          className="mt-2"
        >
          <p className="text-ink-2">Le bar fonctionne normalement. Si le client arrête son abonnement, suspendez-le ici.</p>
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="suspend" value="1" />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="field min-w-0 flex-1 basis-64">
              <span>Raison (facultatif, visible par l&apos;agence seulement)</span>
              <input name="note" maxLength={200} placeholder="Ex. : abonnement résilié, impayé…" className="input" />
            </label>
            <button type="submit" disabled={pending} className="btn btn--danger">
              <Icon name="pause" size={16} />
              {pending ? "Suspension…" : "Suspendre le bar"}
            </button>
          </div>
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
