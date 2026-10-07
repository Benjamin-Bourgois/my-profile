import { Icon, type IconName } from "@/components/Icon";
import { openVenue } from "@/lib/venue-actions";

const TARGETS: { target: string; label: string; icon: IconName }[] = [
  { target: "/admin", label: "Espace gérant", icon: "pencil" },
  { target: "/bar", label: "Écran du bar", icon: "bell" },
  { target: "/stocks", label: "Stocks", icon: "box" },
];

/** Ouvrir un bar comme son gérant (l'agence a accès à tous les bars). */
export function OpenVenueButtons({ venueId, only }: { venueId: string; only?: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TARGETS.filter((t) => !only || only.includes(t.target)).map((t) => (
        <form key={t.target} action={openVenue}>
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="target" value={t.target} />
          <button type="submit" className="btn btn--ghost btn--sm">
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}
