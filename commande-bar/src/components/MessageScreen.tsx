import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/Icon";

/** Écran plein, centré, pour les messages (carte inconnue, erreur…). */
export function MessageScreen({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: IconName;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <span aria-hidden className="mb-6 grid h-16 w-16 place-items-center rounded-full border border-line bg-card text-ink-2">
        <Icon name={icon} size={26} />
      </span>
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="text-[32px]">{title}</h1>
      <div className="mt-3 max-w-sm text-ink-2">{children}</div>
    </main>
  );
}
