"use client";

import { useCallback, useState, useTransition } from "react";

import { runAdminAction } from "@/app/admin/actions";

/**
 * Lance une modification de l'espace gérant. `optimistic` met l'écran à jour
 * immédiatement, sans attendre le serveur ; en cas de refus, la page revient
 * d'elle-même à l'état réel et un message s'affiche.
 */
export function useAdminAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    (fn: string, args: Record<string, unknown>, optimistic?: () => void) =>
      new Promise<{ ok: boolean; data?: unknown }>((resolve) => {
        startTransition(async () => {
          optimistic?.();
          const result = await runAdminAction(fn, args);
          setError(result.error ?? null);
          resolve({ ok: !result.error, data: result.data });
        });
      }),
    [],
  );

  return { run, pending, error, setError };
}
