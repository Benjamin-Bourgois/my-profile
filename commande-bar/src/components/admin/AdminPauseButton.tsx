"use client";

import { useOptimistic } from "react";

import { PauseOrdersButton } from "@/components/PauseOrdersButton";
import { useAdminAction } from "@/lib/use-admin-action";

/** Pause des commandes depuis l'en-tête de l'espace gérant. */
export function AdminPauseButton({ venueId, paused }: { venueId: string; paused: boolean }) {
  const { run, error } = useAdminAction();
  const [shown, setShown] = useOptimistic(paused);

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-[13px] text-danger">{error}</span>}
      <PauseOrdersButton
        paused={shown}
        onToggle={(next) => run("set_orders_paused", { p_venue_id: venueId, p_paused: next }, () => setShown(next))}
      />
    </span>
  );
}
