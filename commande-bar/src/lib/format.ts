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
