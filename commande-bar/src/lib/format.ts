const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** 650 → « 6,50 € » */
export function formatPrice(cents: number): string {
  return euros.format(cents / 100);
}
