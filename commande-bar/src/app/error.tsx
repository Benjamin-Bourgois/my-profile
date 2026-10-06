"use client"; // Les pages d'erreur s'exécutent dans le navigateur

import { useEffect } from "react";

import { MessageScreen } from "@/components/MessageScreen";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <MessageScreen icon="😕" title="Petit souci technique">
      <p>Réessayez dans un instant, ou demandez au serveur.</p>
      <button type="button" onClick={() => retry()} className="mt-6 h-12 rounded-xl bg-stone-900 px-6 font-bold text-white">
        Réessayer
      </button>
      {error.digest && <p className="mt-4 text-xs text-stone-400">Référence : {error.digest}</p>}
    </MessageScreen>
  );
}
