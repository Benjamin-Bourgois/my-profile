import "server-only";

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signOut } from "@/app/connexion/actions";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { MessageScreen } from "@/components/MessageScreen";
import { diagnose } from "@/lib/diagnose";
import { missingConfig } from "@/lib/env";
import { getStaffSession, isAgency, type StaffVenue } from "@/lib/staff";

/**
 * Pages du personnel (écran du bar, prise de commande, stocks) : configuration,
 * connexion et bar de la personne. Renvoie le bar, ou l'écran à afficher à la place.
 */
export async function staffPageGuard(path: string): Promise<{ venue: StaffVenue } | { screen: ReactNode }> {
  const missing = missingConfig();
  if (missing.length) return { screen: <ConfigManquante missing={missing} /> };

  let session;
  try {
    session = await getStaffSession();
  } catch (error) {
    console.error(`${path} : lecture du compte impossible`, error);
    return { screen: <ErreurTechnique hint={diagnose(error)} /> };
  }
  if (!session) redirect(`/connexion?next=${path}`);

  // Un compte peut appartenir à plusieurs bars ; pour l'instant on affiche le premier.
  const venue = session.venues[0];
  if (!venue) {
    if (await isAgency()) redirect("/agence");
    return {
      screen: (
        <MessageScreen icon="lock" title="Aucun bar associé">
          <p>Le compte {session.user.email} n&apos;est rattaché à aucun bar.</p>
          <form action={signOut} className="mt-6">
            <button type="submit" className="btn btn--ghost">
              Se déconnecter
            </button>
          </form>
        </MessageScreen>
      ),
    };
  }
  return { venue };
}
