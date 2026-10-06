import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/connexion/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPauseButton } from "@/components/admin/AdminPauseButton";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { MessageScreen } from "@/components/MessageScreen";
import { diagnose } from "@/lib/diagnose";
import { missingConfig } from "@/lib/env";
import { getStaffSession } from "@/lib/staff";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Espace gérant", robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const missing = missingConfig();
  if (missing.length) return <ConfigManquante missing={missing} />;

  let session;
  try {
    session = await getStaffSession();
  } catch (error) {
    console.error("Espace gérant : lecture du compte impossible", error);
    return <ErreurTechnique hint={diagnose(error)} />;
  }
  if (!session) redirect("/connexion?next=/admin");

  const venue = session.venues.find((v) => v.role === "owner");
  if (!venue) {
    return (
      <MessageScreen icon="🔒" title="Réservé au gérant">
        <p>Le compte {session.user.email} a accès à l&apos;écran du bar, mais pas à l&apos;espace gérant.</p>
        <Link href="/bar" className="mt-6 inline-block font-semibold text-stone-900 underline">
          Aller à l&apos;écran du bar
        </Link>
      </MessageScreen>
    );
  }

  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="bg-stone-900 text-white print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <h1 className="text-xl font-bold">{venue.name}</h1>
          <span className="text-stone-400">Espace gérant</span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <AdminPauseButton venueId={venue.id} paused={venue.orders_paused} />
            <Link href="/bar" className="flex h-11 items-center rounded-xl bg-stone-700 px-4 font-semibold hover:bg-stone-600">
              Écran du bar →
            </Link>
            <form action={signOut}>
              <button type="submit" className="h-11 px-2 text-stone-300 underline">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
