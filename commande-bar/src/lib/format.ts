const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** 650 → « 6,50 € » */
export function formatPrice(cents: number): string {
  return euros.format(cents / 100);
}

/** Heure « 21:04 » dans le fuseau du bar. */
export function formatTime(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

/** « 6,50 », « 6.5 € » → 650 ; null si le montant est illisible ou dépasse 1 000 €. */
export function parsePrice(input: string): number | null {
  const normalized = input.replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents <= 100000 ? cents : null;
}
