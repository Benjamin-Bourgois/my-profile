import type { Metadata } from "next";
import Link from "next/link";

import { PrintButton } from "@/components/admin/PrintButton";
import { ErreurTechnique } from "@/components/ErreurTechnique";
import { Icon } from "@/components/Icon";
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
        <Link href="/admin/tables" className="btn btn--ghost btn--sm">
          <Icon name="arrowLeft" size={16} />
          Tables
        </Link>
        <p className="flex-1 text-ink-2">Une étiquette par table active, à découper et coller sur les cartes.</p>
        <PrintButton />
      </div>
      <ul className="grid grid-cols-2 gap-4 print:gap-6">
        {tables.map((table) => (
          <li key={table.id} className="break-inside-avoid rounded-md border border-dashed border-line bg-card p-6 text-center">
            <p className="eyebrow">{data.venue.name}</p>
            <p className="mt-1 font-serif text-[34px] font-semibold leading-tight">{table.label}</p>
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(table.qrSvg)}`} alt="" className="mx-auto mt-4 h-44 w-44" />
            <p className="mt-3 text-[14px] text-ink-2">Approchez votre téléphone ou scannez pour commander</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
