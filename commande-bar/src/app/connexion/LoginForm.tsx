"use client";

import { useActionState } from "react";

import { signIn, type LoginState } from "@/app/connexion/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action} className="mt-8 grid gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} className="input" />
      </label>
      <label className="field">
        <span>Mot de passe</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      {state.error && (
        <p role="alert" className="whitespace-pre-line rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn--primary btn--block mt-2">
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
