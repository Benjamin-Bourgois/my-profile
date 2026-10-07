// Stocks : types renvoyés par la base et mises en forme (partagés serveur / navigateur).

export const STOCK_UNITS = ["unité", "bouteille", "canette", "portion", "L", "cl", "kg", "g"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export type StockStatus = "ok" | "low" | "out";

export type StockItem = {
  id: string;
  name: string;
  unit: StockUnit;
  quantity: number;
  alert_threshold: number | null;
  status: StockStatus;
  used_by: { name: string; quantity: number }[];
  sold_7d: number;
  last_delivery_at: string | null;
  updated_at: string;
};

export type StockData = { is_owner: boolean; items: StockItem[] };

export type StockMovementKind = "sale" | "sale_cancel" | "delivery" | "loss" | "count" | "adjust";

export type StockMovement = {
  id: string;
  kind: StockMovementKind;
  delta: number;
  quantity_after: number;
  note: string | null;
  created_at: string;
  author: string | null;
  order_number: number | null;
  table_label: string | null;
};

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

const PLURALS: Partial<Record<StockUnit, string>> = {
  unité: "unités",
  bouteille: "bouteilles",
  canette: "canettes",
  portion: "portions",
};

/** 18 + bouteille → « 18 bouteilles » ; 26.5 + L → « 26,5 L » */
export function formatQuantity(quantity: number, unit: StockUnit): string {
  const value = Number(quantity);
  const label = Math.abs(value) >= 2 ? (PLURALS[unit] ?? unit) : unit;
  return `${number.format(value)} ${label}`;
}

/** « 0,25 » → 0.25 ; null si illisible. */
export function parseQuantity(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Jours avant rupture, d'après les ventes des 7 derniers jours. */
export function daysLeft(item: Pick<StockItem, "quantity" | "sold_7d">): number | null {
  const perDay = Number(item.sold_7d) / 7;
  if (perDay <= 0) return null;
  return Math.max(0, Math.floor(Number(item.quantity) / perDay));
}

export const MOVEMENT_LABEL: Record<StockMovementKind, string> = {
  sale: "Vente",
  sale_cancel: "Commande annulée",
  delivery: "Livraison",
  loss: "Perte / casse",
  count: "Inventaire",
  adjust: "Correction",
};
