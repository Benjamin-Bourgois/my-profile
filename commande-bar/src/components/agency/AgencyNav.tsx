"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/agence", label: "Bars et accès" },
  { href: "/agence/ia", label: "Lecture des bons (IA)" },
];

export function AgencyNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Espace agence" className="no-scrollbar mx-auto flex max-w-[1100px] gap-2 overflow-x-auto px-4 pb-3">
      {LINKS.map((link) => {
        const active = link.href === "/agence" ? pathname === "/agence" || pathname.startsWith("/agence/bars") : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className="chip shrink-0">
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
