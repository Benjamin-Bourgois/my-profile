import { signOut } from "@/app/connexion/actions";
import { MessageScreen } from "@/components/MessageScreen";

/** Équipe d'un bar dont l'abonnement est suspendu par l'agence. */
export function AccesSuspendu({ venueName }: { venueName: string }) {
  return (
    <MessageScreen icon="lock" eyebrow={venueName} title="Accès suspendu">
      <p>L&apos;accès à la commande à table est suspendu pour cet établissement. Pour le réactiver, contactez Tapigo.</p>
      <form action={signOut} className="mt-6">
        <button type="submit" className="btn btn--ghost">
          Se déconnecter
        </button>
      </form>
    </MessageScreen>
  );
}
