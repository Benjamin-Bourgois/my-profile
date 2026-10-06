import Link from "next/link";

import { MessageScreen } from "@/components/MessageScreen";

export default function NotFound() {
  return (
    <MessageScreen icon="search" title="Page introuvable">
      <p>Si vous êtes au bar, approchez à nouveau votre téléphone de la carte posée sur la table, ou demandez au serveur.</p>
      <Link href="/" className="btn btn--ghost mt-6">
        Accueil
      </Link>
    </MessageScreen>
  );
}
