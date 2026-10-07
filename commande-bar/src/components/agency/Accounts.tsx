"use client";

import { useActionState, useRef, useState } from "react";

import { addMember, updateMember } from "@/app/agence/actions";
import { Credentials } from "@/components/agency/Credentials";
import { Icon } from "@/components/Icon";
import { ROLE_LABEL, type AgencyActionResult, type AgencyMember } from "@/lib/agency";
import { newPassword } from "@/lib/password";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function Feedback({ state, loginUrl }: { state: AgencyActionResult; loginUrl: string }) {
  return (
    <>
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
      {state.credentials?.password && (
        <div className="mt-3">
          <Credentials loginUrl={loginUrl} email={state.credentials.email} password={state.credentials.password} />
        </div>
      )}
    </>
  );
}

/** Un compte du bar : rôle, nouveau mot de passe, retrait de l'accès. */
export function MemberRow({ venueId, member, loginUrl }: { venueId: string; member: AgencyMember; loginUrl: string }) {
  const [state, action, pending] = useActionState<AgencyActionResult, FormData>(updateMember, {});
  const [role, setRole] = useState(member.role);
  const passwordForm = useRef<HTMLFormElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const ids = (
    <>
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="user_id" value={member.user_id} />
      <input type="hidden" name="email" value={member.email} />
    </>
  );

  function resetPassword() {
    if (!window.confirm(`Donner un nouveau mot de passe à ${member.email} ?\n\nL'ancien ne fonctionnera plus.`)) return;
    if (passwordInput.current) passwordInput.current.value = newPassword();
    passwordForm.current?.requestSubmit();
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="break-all font-semibold">{member.email}</p>
          <p className="text-[13px] text-muted">
            {member.last_sign_in_at ? `Dernière connexion : ${dateFormat.format(new Date(member.last_sign_in_at))}` : "Jamais connecté"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={action}>
            {ids}
            <label className="sr-only" htmlFor={`role-${member.user_id}`}>
              Rôle de {member.email}
            </label>
            <select
              id={`role-${member.user_id}`}
              name="op"
              value={role}
              disabled={pending}
              onChange={(e) => {
                setRole(e.target.value as AgencyMember["role"]);
                e.currentTarget.form?.requestSubmit();
              }}
              className="input !min-h-0 !h-10 !w-auto !rounded-full !py-0"
            >
              <option value="owner">{ROLE_LABEL.owner}</option>
              <option value="staff">{ROLE_LABEL.staff}</option>
            </select>
          </form>
          <form action={action} ref={passwordForm}>
            {ids}
            <input type="hidden" name="op" value="password" />
            <input type="hidden" name="password" ref={passwordInput} />
            <button type="button" onClick={resetPassword} disabled={pending} className="btn btn--ghost btn--sm">
              <Icon name="lock" size={15} />
              Nouveau mot de passe
            </button>
          </form>
          <form
            action={action}
            onSubmit={(e) => {
              if (!window.confirm(`Retirer l'accès de ${member.email} à ce bar ?`)) e.preventDefault();
            }}
          >
            {ids}
            <input type="hidden" name="op" value="remove" />
            <button type="submit" disabled={pending} className="btn btn--ghost btn--sm text-danger">
              <Icon name="trash" size={15} />
              Retirer l&apos;accès
            </button>
          </form>
        </div>
      </div>
      <Feedback state={state} loginUrl={loginUrl} />
    </li>
  );
}

/** Donner l'accès à un bar : nouveau compte, ou compte existant. */
export function AddMemberForm({ venueId, loginUrl, initialPassword }: { venueId: string; loginUrl: string; initialPassword: string }) {
  const [password, setPassword] = useState(initialPassword);
  const [state, action, pending] = useActionState<AgencyActionResult, FormData>(async (previous, formData) => {
    const result = await addMember(previous, formData);
    if (result.credentials) setPassword(newPassword()); // le prochain compte aura un autre mot de passe
    return result;
  }, {});

  return (
    <form action={action} className="rounded-md border border-line bg-sand-2 p-4">
      <p className="font-semibold">Donner un accès</p>
      <input type="hidden" name="venue_id" value={venueId} />
      <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_0.8fr_1.2fr_auto] md:items-end">
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required placeholder="prenom@le-bar.fr" className="input" autoComplete="off" />
        </label>
        <label className="field">
          <span>Rôle</span>
          <select name="role" defaultValue="staff" className="input">
            <option value="owner">{ROLE_LABEL.owner}</option>
            <option value="staff">{ROLE_LABEL.staff}</option>
          </select>
        </label>
        <label className="field">
          <span>Mot de passe (nouveau compte)</span>
          <span className="flex gap-2">
            <input
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              className="input font-mono"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setPassword(newPassword())}
              aria-label="Générer un autre mot de passe"
              title="Générer un autre mot de passe"
              className="icon-btn shrink-0 !h-[46px] !w-[46px]"
            >
              <Icon name="refresh" size={17} />
            </button>
          </span>
        </label>
        <button type="submit" disabled={pending} className="btn btn--primary">
          <Icon name="plus" size={16} />
          {pending ? "Ajout…" : "Ajouter"}
        </button>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Gérant : tout le bar (carte, tables, réglages, statistiques). Équipe : écran du bar, prise de commande, stocks. Si
        l&apos;email a déjà un compte, il garde son mot de passe.
      </p>
      <Feedback state={state} loginUrl={loginUrl} />
    </form>
  );
}
