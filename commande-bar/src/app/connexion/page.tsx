import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/connexion/LoginForm";
import { ConfigManquante } from "@/components/ConfigManquante";
import { missingConfig } from "@/lib/env";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connexion du personnel", robots: { index: false } };

export default async function ConnexionPage(props: PageProps<"/connexion">) {
  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/bar";

  // Déjà connecté : direction l'écran demandé.
  const supabase = await getServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(nextPath);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">Commande à table</p>
      <h1 className="mt-2 text-3xl font-bold">Espace personnel</h1>
      <p className="mt-2 text-stone-600">Connecte-toi pour voir les commandes du bar.</p>
      <LoginForm next={nextPath} />
    </main>
  );
}
