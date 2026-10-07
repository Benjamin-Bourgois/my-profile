import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/connexion/LoginForm";
import { ConfigManquante } from "@/components/ConfigManquante";
import { missingConfig } from "@/lib/env";
import { isAgency } from "@/lib/staff";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connexion du personnel", robots: { index: false } };

export default async function ConnexionPage(props: PageProps<"/connexion">) {
  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "";

  // Déjà connecté : direction l'écran demandé (sinon l'écran du bar, ou l'espace agence).
  const supabase = await getServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(nextPath || ((await isAgency()) ? "/agence" : "/bar"));

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-matte font-serif text-[30px] font-semibold italic text-sand">
        T
      </span>
      <p className="eyebrow mt-6">Commande à table</p>
      <h1 className="mt-1 text-[34px]">Espace personnel</h1>
      <p className="mt-1 text-ink-2">Connectez-vous pour voir les commandes du bar.</p>
      <LoginForm next={nextPath} />
    </main>
  );
}
