"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";

import { openVenue } from "@/lib/venue-actions";

/** Choix du bar ouvert, pour un compte qui a accès à plusieurs bars. */
export function VenueSwitcher({ venues, currentId }: { venues: { id: string; name: string; suspended?: boolean }[]; currentId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  return (
    <form ref={form} action={openVenue} className="flex items-center gap-2">
      <input type="hidden" name="target" value={pathname} />
      <label className="sr-only" htmlFor="venue-switcher">
        Bar ouvert
      </label>
      <select
        id="venue-switcher"
        name="venue_id"
        defaultValue={currentId}
        onChange={() => form.current?.requestSubmit()}
        className="input !min-h-0 !h-10 !w-auto max-w-[240px] !rounded-full !py-0"
      >
        {venues.map((venue) => (
          <option key={venue.id} value={venue.id}>
            {venue.name}
            {venue.suspended ? " (suspendu)" : ""}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn btn--ghost btn--sm">
          Ouvrir
        </button>
      </noscript>
    </form>
  );
}
