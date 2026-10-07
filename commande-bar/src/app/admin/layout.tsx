import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/connexion/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPauseButton } from "@/components/admin/AdminPauseButton";
import { ConfigManquante } from "@/components/ConfigManquante";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
import { MessageScreen } from "@/components/MessageScreen";
import { VenueMark } from "@/components/VenueMark";
import { diagnose } from "@/lib/diagnose";
import { missingConfig } from "@/lib/env";
import { getStaffSession, isAgency } from "@/lib/staff";

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
    if (session.venues.length === 0 && (await isAgency())) redirect("/agence");
    return (
      <MessageScreen icon="lock" title="Réservé au gérant">
        <p>Le compte {session.user.email} a accès à l&apos;écran du bar, mais pas à l&apos;espace gérant.</p>
        <Link href="/bar" className="btn btn--ghost mt-6">
          Aller à l&apos;écran du bar
        </Link>
      </MessageScreen>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line print:hidden">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
            <VenueMark name={venue.name} logoUrl={venue.logo_url} size={40} />
            <div className="min-w-0">
              <p className="eyebrow">Espace gérant</p>
              <h1 className="truncate text-[24px]">{venue.name}</h1>
            </div>
          </div>
          <div className="order-last flex w-full flex-wrap items-center gap-2 md:order-none md:ml-auto md:w-auto">
            <AdminPauseButton venueId={venue.id} paused={venue.orders_paused} />
            <Link href="/bar" className="btn btn--ghost btn--sm">
              Écran du bar
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <form action={signOut}>
            <button type="submit" aria-label="Déconnexion" title="Déconnexion" className="icon-btn">
              <Icon name="logout" size={17} />
            </button>
          </form>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
