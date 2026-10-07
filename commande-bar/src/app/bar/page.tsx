import type { Metadata } from "next";

import { BarScreen } from "@/components/bar/BarScreen";
import { staffPageGuard } from "@/lib/staff-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Écran du bar", robots: { index: false } };

export default async function BarPage() {
  const guard = await staffPageGuard("/bar");
  if ("screen" in guard) return guard.screen;
  return <BarScreen venue={guard.venue} />;
}
