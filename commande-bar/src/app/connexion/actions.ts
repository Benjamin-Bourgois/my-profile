"use server";

import { redirect } from "next/navigation";

import { diagnose } from "@/lib/diagnose";
import { getServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

/** N'accepte qu'une adresse interne au site (évite les redirections vers un autre site). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/bar";
}

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Indique ton email et ton mot de passe.", email };

  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) return { error: "Email ou mot de passe incorrect.", email };
    if (/email not confirmed/i.test(error.message)) {
      return { error: "Ce compte n'est pas confirmé : dans Supabase, recrée-le en cochant « Auto Confirm User ».", email };
    }
    console.error("Connexion impossible", error);
    return { error: `Connexion impossible. ${diagnose(error)}`, email };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
