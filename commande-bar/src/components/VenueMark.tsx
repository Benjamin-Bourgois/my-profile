/** Logo du bar, ou rond noir mat avec l'initiale en serif italique couleur sable. */
export function VenueMark({ name, logoUrl, size = 56 }: { name: string; logoUrl: string | null; size?: number }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-line bg-card object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-matte font-serif font-semibold italic text-sand"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
