import { TableBadge } from "@/components/TableBadge";
import { VenueMark } from "@/components/VenueMark";
import type { Menu } from "@/lib/menu";

export function MenuHeader({ venue, tableLabel }: { venue: Menu["venue"]; tableLabel: string }) {
  return (
    <header className="mx-auto max-w-[680px] px-4 pb-2 pt-6">
      <div className="flex items-center gap-4">
        <VenueMark name={venue.name} logoUrl={venue.logo_url} size={52} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Bienvenue</p>
          <h1 className="break-words text-[30px]">{venue.name}</h1>
        </div>
        <TableBadge label={tableLabel} />
      </div>
    </header>
  );
}
