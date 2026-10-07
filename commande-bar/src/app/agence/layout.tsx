import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/app/connexion/actions";
import { AgencyNav } from "@/components/agency/AgencyNav";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
import { MessageScreen } from "@/components/MessageScreen";
import { diagnose } from "@/lib/diagnose";
import { missingConfig } from "@/lib/env";
import { getStaffSession, isAgency } from "@/lib/staff";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Espace agence", robots: { index: false } };

/** Espace de l'agence (Tapigo) : tous les bars, leurs accès, leur abonnement et l'IA. */
export default async function AgencyLayout({ children }: LayoutProps<"/agence">) {
  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  let session;
  try {
    session = await getStaffSession();
  } catch (error) {
    console.error("Espace agence : lecture du compte impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }
  if (!session) redirect("/connexion?next=/agence");

  if (!(await isAgency())) {
    return (
      <MessageScreen icon="lock" title="Réservé à l'agence">
        <p>Le compte {session.user.email} n&apos;est pas un compte de l&apos;agence.</p>
        <form action={signOut} className="mt-6">
          <button type="submit" className="btn btn--ghost">
            Se déconnecter
          </button>
        </form>
      </MessageScreen>
    );
  }

  return (
    <div className="min-h-dvh pb-16">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-matte font-serif text-[22px] font-semibold italic text-sand">
            T
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Tapigo</p>
            <h1 className="truncate text-[24px]">Espace agence</h1>
          </div>
          <form action={signOut}>
            <button type="submit" aria-label="Déconnexion" title="Déconnexion" className="icon-btn">
              <Icon name="logout" size={17} />
            </button>
          </form>
        </div>
        <AgencyNav />
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-6">{children}</main>
    </div>
  );
}
