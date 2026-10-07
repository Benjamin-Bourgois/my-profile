// Ventes générées par l'application (suggestions), renvoyées par admin_get_app_sales().

export type AppSales = {
  enabled: boolean;
  period: {
    pairing_cents: number;
    pairing_items: number;
    reorder_cents: number;
    reorder_items: number;
    orders: number;
  };
  /** Chiffre d'affaires de la même période (pour la part) */
  revenue_cents: number;
  /** Depuis le 1er du mois en cours */
  month_cents: number;
};

export const appSalesTotal = (sales: AppSales) => sales.period.pairing_cents + sales.period.reorder_cents;
