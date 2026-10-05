import type { Menu } from "@/lib/menu";

export function MenuHeader({ venue, tableLabel }: { venue: Menu["venue"]; tableLabel: string }) {
  return (
    <header className="bg-stone-900 px-4 pb-6 pt-8 text-white">
      <div className="mx-auto flex max-w-xl items-center gap-4">
        {venue.logo_url ? (
          <img src={venue.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-full bg-white object-cover" />
        ) : (
          <div
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-amber-400 text-3xl font-bold text-stone-900"
          >
            {venue.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight">{venue.name}</h1>
          <p className="mt-2 inline-flex rounded-full bg-amber-400 px-3 py-1 text-base font-bold text-stone-900">
            {tableLabel}
          </p>
        </div>
      </div>
    </header>
  );
}
