// Données de l'espace gérant (partagées entre le serveur et le navigateur).

import type { BarOrder } from "@/lib/order-types";

export type AdminProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
};

export type AdminCategory = { id: string; name: string; products: AdminProduct[] };

export type AdminTable = { id: string; label: string; token: string; is_active: boolean };

export type AdminSettings = {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string;
  pay_to_staff_enabled: boolean;
  online_payment_enabled: boolean;
};

export type AdminData = { venue: AdminSettings; categories: AdminCategory[]; tables: AdminTable[] };

export type DayTotals = {
  count: number;
  cancelled_count: number;
  revenue_cents: number;
  online_cents: number;
  staff_paid_cents: number;
  to_collect_cents: number;
};

export type DayData = { business_date: string; today: string; orders: BarOrder[]; totals: DayTotals };

/** Table avec son lien complet et son QR code, prêts à afficher. */
export type TableWithLink = AdminTable & { url: string; qrSvg: string };
