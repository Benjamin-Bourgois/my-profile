import type { Metadata } from "next";

import { ErreurTechnique } from "@/components/ErreurTechnique";
import { StockManager } from "@/components/stock/StockManager";
import { adminErrorMessage } from "@/lib/admin-errors";
import type { StockData } from "@/lib/stock";
import { staffPageGuard } from "@/lib/staff-page";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stocks", robots: { index: false } };

/** Stocks du bar : équipiers (livraisons, pertes, inventaires) et gérant (articles). */
export default async function StocksPage() {
  const guard = await staffPageGuard("/stocks");
  if ("screen" in guard) return guard.screen;

  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("get_stock", { p_venue_id: guard.venue.id });
  if (error) return <ErreurTechnique hint={adminErrorMessage(error)} />;
  return <StockManager venue={guard.venue} initial={data as StockData} />;
}
