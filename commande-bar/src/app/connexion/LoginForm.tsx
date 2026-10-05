"use client";

import { useActionState } from "react";

import { signIn, type LoginState } from "@/app/connexion/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-base font-semibold">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="mt-1 block h-14 w-full rounded-xl border border-stone-300 bg-white px-4 text-lg focus:border-stone-900 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-base font-semibold">Mot de passe</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block h-14 w-full rounded-xl border border-stone-300 bg-white px-4 text-lg focus:border-stone-900 focus:outline-none"
        />
      </label>
      {state.error && (
        <p role="alert" className="whitespace-pre-line rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-14 w-full rounded-2xl bg-stone-900 text-lg font-bold text-white active:bg-stone-700 disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
