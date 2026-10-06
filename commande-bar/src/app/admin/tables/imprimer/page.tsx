import type { Metadata } from "next";
import Link from "next/link";

import { PrintButton } from "@/components/admin/PrintButton";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { getAdminData, requireOwnerVenue, withLinks } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";

export const metadata: Metadata = { title: "QR codes à imprimer" };

/** Planche de QR codes (secours des cartes NFC), prête à imprimer. */
export default async function PrintQrPage() {
  const venue = await requireOwnerVenue();
  let data;
  try {
    data = await getAdminData(venue.id);
  } catch (error) {
    return <ErreurTechnique hint={adminErrorMessage(error as { message?: string })} />;
  }
  const tables = (await withLinks(data.tables)).filter((table) => table.is_active);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/admin/tables" className="font-semibold underline">
          ← Tables
        </Link>
        <p className="flex-1 text-stone-600">Une étiquette par table active, à découper et coller sur les cartes.</p>
        <PrintButton />
      </div>
      <ul className="grid grid-cols-2 gap-4 print:gap-6">
        {tables.map((table) => (
          <li key={table.id} className="break-inside-avoid rounded-2xl border-2 border-dashed border-stone-300 bg-white p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-stone-500">{data.venue.name}</p>
            <p className="mt-1 text-3xl font-black">{table.label}</p>
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(table.qrSvg)}`} alt="" className="mx-auto mt-4 h-44 w-44" />
            <p className="mt-3 text-base">Approchez votre téléphone ou scannez pour commander</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
