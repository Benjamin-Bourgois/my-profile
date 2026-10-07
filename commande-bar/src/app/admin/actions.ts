"use server";

import { refresh } from "next/cache";

import { adminErrorMessage } from "@/lib/admin-errors";
import { getServerClient } from "@/lib/supabase/server";

/** Fonctions de la base que l'espace gérant a le droit d'appeler (chacune vérifie le rôle de gérant). */
const ADMIN_FUNCTIONS = new Set([
  "admin_move",
  "admin_save_category",
  "admin_delete_category",
  "admin_save_product",
  "admin_set_product_available",
  "admin_delete_product",
  "admin_save_table",
  "admin_set_table_active",
  "admin_delete_table",
  "admin_update_settings",
  "regenerate_table_token",
  "set_orders_paused",
  "admin_set_suggestions_enabled",
  "admin_set_product_pairings",
]);

export type AdminActionResult = { error?: string; data?: unknown };

/**
 * Modification demandée depuis l'espace gérant. La réponse renvoie aussi la
 * page à jour (refresh) : l'écran ne « saute » pas après une mise à jour immédiate.
 */
export async function runAdminAction(fn: string, args: Record<string, unknown>): Promise<AdminActionResult> {
  if (!ADMIN_FUNCTIONS.has(fn)) return { error: "Action inconnue." };
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  refresh();
  if (error) {
    console.error(`Espace gérant : ${fn} refusé`, error);
    return { error: adminErrorMessage(error) };
  }
  return { data };
}
