import type { ReactNode } from "react";

/** Écran plein, centré, pour les messages (carte inconnue, erreur…). */
export function MessageScreen({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <div aria-hidden className="mb-6 text-6xl">
        {icon}
      </div>
      <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
      <div className="mt-3 max-w-sm text-lg text-stone-600">{children}</div>
    </main>
  );
}
