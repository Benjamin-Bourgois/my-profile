import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/app/connexion/actions";
import { BarScreen } from "@/components/bar/BarScreen";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { MessageScreen } from "@/components/MessageScreen";
import { diagnose } from "@/lib/diagnose";
import { missingConfig } from "@/lib/env";
import { getStaffSession } from "@/lib/staff";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Écran du bar", robots: { index: false } };

export default async function BarPage() {
  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  let session;
  try {
    session = await getStaffSession();
  } catch (error) {
    console.error("Écran du bar : lecture du compte impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }
  if (!session) redirect("/connexion?next=/bar");

  // Un compte peut appartenir à plusieurs bars ; pour l'instant on affiche le premier.
  const venue = session.venues[0];
  if (!venue) {
    return (
      <MessageScreen icon="🔒" title="Aucun bar associé">
        <p>Le compte {session.user.email} n&apos;est rattaché à aucun bar.</p>
        <form action={signOut} className="mt-6">
          <button type="submit" className="font-semibold text-stone-900 underline">
            Se déconnecter
          </button>
        </form>
      </MessageScreen>
    );
  }

  return <BarScreen venue={venue} />;
}
