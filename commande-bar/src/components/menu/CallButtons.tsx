"use client";

import { useState } from "react";

import type { CallKind } from "@/lib/order-types";

const BUTTONS: { kind: CallKind; icon: string; label: string; sent: string }[] = [
  { kind: "waiter", icon: "🙋", label: "Appeler un serveur", sent: "Serveur prévenu" },
  { kind: "bill", icon: "🧾", label: "L'addition", sent: "Addition demandée" },
];

/** Durée d'affichage de la confirmation, avant de pouvoir rappeler. */
const SENT_DISPLAY_MS = 60_000;

/** « Appeler un serveur » / « L'addition » : s'affiche avec un son sur l'écran du bar. */
export function CallButtons({ token }: { token: string }) {
  const [sent, setSent] = useState<Partial<Record<CallKind, boolean>>>({});
  const [pending, setPending] = useState<CallKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(kind: CallKind) {
    if (pending || sent[kind]) return;
    setPending(kind);
    setError(null);
    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "L'appel n'est pas parti. Faites signe à un serveur.");
        return;
      }
      setSent((current) => ({ ...current, [kind]: true }));
      window.setTimeout(() => setSent((current) => ({ ...current, [kind]: false })), SENT_DISPLAY_MS);
    } catch {
      setError("Pas de connexion. Faites signe à un serveur.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {BUTTONS.map(({ kind, icon, label, sent: sentLabel }) => (
          <button
            key={kind}
            type="button"
            onClick={() => call(kind)}
            disabled={pending !== null && pending !== kind}
            aria-live="polite"
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-base font-semibold leading-tight ring-1 transition-colors ${
              sent[kind]
                ? "bg-green-100 text-green-900 ring-green-300"
                : "bg-white text-stone-900 ring-stone-300 active:bg-stone-100"
            }`}
          >
            <span aria-hidden>{sent[kind] ? "✓" : icon}</span>
            <span>{pending === kind ? "Envoi…" : sent[kind] ? sentLabel : label}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-4 py-2 text-base text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
