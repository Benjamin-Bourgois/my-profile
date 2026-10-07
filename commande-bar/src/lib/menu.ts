import "server-only";

import { cache } from "react";

import type { StaffPaymentOptions } from "@/lib/order-types";
import type { ReorderOffer, Suggestions } from "@/lib/suggestions";
import { getAdminClient } from "@/lib/supabase/admin";

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  /** S'il n'en reste que 5 ou moins en stock (sinon absent). */
  remaining?: number | null;
};

export type MenuCategory = {
  id: string;
  name: string;
  products: MenuProduct[];
};

export type Menu = {
  table: { id: string; label: string };
  venue: {
    id: string;
    name: string;
    logo_url: string | null;
    currency: string;
    pay_to_staff_enabled: boolean;
    online_payment_enabled: boolean;
    orders_paused: boolean;
  };
  categories: MenuCategory[];
};

/** Format des liens secrets des cartes (12 caractères aujourd'hui). */
export const TOKEN_PATTERN = /^[A-Za-z0-9]{12,32}$/;

/**
 * Carte du bar pour le lien secret d'une table.
 * Renvoie `null` si le lien est inconnu ou la carte désactivée.
 */
export const getMenu = cache(async (token: string): Promise<Menu | null> => {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await getAdminClient().rpc("get_menu", { p_token: token });
  if (error) throw error;
  return (data as Menu | null) ?? null;
});

/** Le bar de cette table a-t-il été suspendu par l'agence (abonnement arrêté) ? */
export async function isTableVenueSuspended(token: string): Promise<boolean> {
  if (!TOKEN_PATTERN.test(token)) return false;
  const { data, error } = await getAdminClient().rpc("get_table_venue_suspended", { p_token: token });
  // Base sans le script 9 : pas de suspension possible
  return !error && data === true;
}

/** Moyens acceptés au serveur par ce bar (null : base sans le script 11, ou lien inconnu). */
export async function getStaffPaymentOptions(token: string): Promise<StaffPaymentOptions | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await getAdminClient().rpc("get_staff_payment_options", { p_token: token });
  return error ? null : ((data as StaffPaymentOptions | null) ?? null);
}

/** Suggestions pour cette table (null : base sans le script 10, ou lien inconnu). */
export async function getSuggestions(token: string): Promise<Suggestions | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await getAdminClient().rpc("get_suggestions", { p_token: token });
  return error ? null : ((data as Suggestions | null) ?? null);
}

/** « Une autre tournée ? » pour une commande (null : suggestions désactivées ou base sans le script 10). */
export async function getReorderOffer(orderId: string, token: string): Promise<ReorderOffer | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await getAdminClient().rpc("get_reorder_items", { p_order_id: orderId, p_token: token });
  return error ? null : ((data as ReorderOffer | null) ?? null);
}
