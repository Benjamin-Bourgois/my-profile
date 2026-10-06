"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Commandes du jour" },
  { href: "/admin/carte", label: "Carte" },
  { href: "/admin/tables", label: "Tables & cartes NFC" },
  { href: "/admin/reglages", label: "Réglages" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Espace gérant" className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
      {LINKS.map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 shrink-0 items-center rounded-xl px-4 text-base font-bold ${
              active ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300 hover:bg-stone-700"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
