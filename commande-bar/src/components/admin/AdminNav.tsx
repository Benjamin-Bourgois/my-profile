"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Commandes du jour" },
  { href: "/admin/statistiques", label: "Statistiques" },
  { href: "/admin/carte", label: "Carte" },
  { href: "/admin/tables", label: "Tables & cartes NFC" },
  { href: "/stocks", label: "Stocks" },
  { href: "/admin/reglages", label: "Réglages" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Espace gérant" className="no-scrollbar mx-auto flex max-w-[1100px] gap-2 overflow-x-auto px-4 pb-3">
      {LINKS.map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className="chip">
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
