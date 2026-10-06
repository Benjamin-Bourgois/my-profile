import "server-only";

import { cache } from "react";

import { getAdminClient } from "@/lib/supabase/admin";

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
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
