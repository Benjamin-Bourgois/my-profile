"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { createVenue } from "@/app/agence/actions";
import { Credentials } from "@/components/agency/Credentials";
import { Icon } from "@/components/Icon";
import { Sheet, SheetBody, SheetFooter } from "@/components/Sheet";
import type { AgencyActionResult } from "@/lib/agency";
import { newPassword } from "@/lib/password";

/** « Nouveau bar » : le bar, et si on le souhaite le compte de son gérant. */
export function NewVenueSheet({ loginUrl }: { loginUrl: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn--primary btn--sm">
        <Icon name="plus" size={16} />
        Nouveau bar
      </button>
      {open && (
        <NewVenueForm
          key={key}
          loginUrl={loginUrl}
          onClose={() => {
            setOpen(false);
            setKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function NewVenueForm({ loginUrl, onClose }: { loginUrl: string; onClose: () => void }) {
  const [state, action, pending] = useActionState<AgencyActionResult, FormData>(createVenue, {});
  const [password, setPassword] = useState(newPassword);
  const created = Boolean(state.venueId);

  return (
    <Sheet title="Nouveau bar" eyebrow="Espace agence" onClose={onClose}>
      {created ? (
        <>
          <SheetBody>
            {state.done && (
              <p role="status" className="flex items-center gap-2 font-semibold text-ok">
                <Icon name="check" size={18} />
                {state.done}
              </p>
            )}
            {state.error && <p className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">{state.error}</p>}
            {state.credentials?.created && (
              <div className="mt-4">
                <Credentials loginUrl={loginUrl} email={state.credentials.email} password={state.credentials.password} />
              </div>
            )}
            {state.credentials && !state.credentials.created && (
              <p className="mt-4 text-ink-2">
                {state.credentials.email} avait déjà un compte : il garde son mot de passe et devient gérant de ce bar.
              </p>
            )}
            <p className="mt-4 text-ink-2">
              Le gérant crée ensuite sa carte et ses tables dans son espace gérant. Vous pouvez aussi le faire pour lui : ouvrez la
              fiche du bar, puis « Espace gérant ».
            </p>
          </SheetBody>
          <SheetFooter>
            <Link href={`/agence/bars/${state.venueId}`} onClick={onClose} className="btn btn--primary btn--block">
              Ouvrir la fiche du bar
            </Link>
          </SheetFooter>
        </>
      ) : (
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <SheetBody>
            <div className="grid gap-4">
              <label className="field">
                <span>Nom du bar</span>
                <input name="name" required maxLength={80} placeholder="Ex. : Le Zinc" className="input" autoComplete="off" />
              </label>
              <fieldset className="grid gap-4 rounded-md border border-line p-4">
                <legend className="px-1 text-[13px] font-semibold text-ink-2">Compte du gérant (facultatif)</legend>
                <label className="field">
                  <span>Email du gérant</span>
                  <input name="email" type="email" placeholder="gerant@le-zinc.fr" className="input" autoComplete="off" />
                </label>
                <label className="field">
                  <span>Mot de passe provisoire</span>
                  <span className="flex gap-2">
                    <input
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      className="input font-mono"
                      autoComplete="off"
                    />
                    <button type="button" onClick={() => setPassword(newPassword())} aria-label="Générer un autre mot de passe" title="Générer un autre mot de passe" className="icon-btn shrink-0 !h-[46px] !w-[46px]">
                      <Icon name="refresh" size={17} />
                    </button>
                  </span>
                </label>
                <p className="text-[13px] text-muted">Si cet email a déjà un compte, il garde son mot de passe.</p>
              </fieldset>
            </div>
          </SheetBody>
          <SheetFooter>
            {state.error && (
              <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn btn--primary btn--block">
              {pending ? "Création…" : "Créer le bar"}
            </button>
          </SheetFooter>
        </form>
      )}
    </Sheet>
  );
}
