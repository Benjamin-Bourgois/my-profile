"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { adminErrorMessage } from "@/lib/admin-errors";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Appelle une fonction de la base au nom du gérant connecté, puis recharge
 * les données de la page. Gère l'état « en cours » et le message d'erreur.
 */
export function useAdminRpc() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown }> => {
      setCalling(true);
      setError(null);
      const { data, error: rpcError } = await getBrowserClient().rpc(fn, args);
      setCalling(false);
      if (rpcError) {
        setError(adminErrorMessage(rpcError));
        startTransition(() => router.refresh());
        return { ok: false };
      }
      startTransition(() => router.refresh());
      return { ok: true, data };
    },
    [router],
  );

  return { call, busy: calling || refreshing, error, setError };
}
