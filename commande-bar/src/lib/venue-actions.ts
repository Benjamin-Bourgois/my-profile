"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getStaffSession, VENUE_COOKIE } from "@/lib/staff";

/** Seules les pages du personnel peuvent suivre le choix d'un bar. */
const TARGETS = /^\/(admin|bar|stocks)(\/[a-z0-9/-]*)?$/;

/**
 * Ouvre un bar (agence, ou compte rattaché à plusieurs bars) puis affiche la page demandée.
 * L'accès reste vérifié par la base à chaque lecture.
 */
export async function openVenue(formData: FormData) {
  const venueId = String(formData.get("venue_id") ?? "");
  const target = String(formData.get("target") ?? "/admin");
  const session = await getStaffSession();
  if (!session) redirect("/connexion");
  if (session.venues.some((v) => v.id === venueId)) {
    (await cookies()).set(VENUE_COOKIE, venueId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  redirect(TARGETS.test(target) ? target : "/admin");
}
