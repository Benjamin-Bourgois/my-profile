"use client";

import { useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import type { CallKind } from "@/lib/order-types";

type CallButton = {
  kind: CallKind;
  icon: IconName;
  /** Texte affiché, puis nom complet lu par les lecteurs d'écran. */
  label: [string, string];
  sent: [string, string];
  toast: string;
};

const BUTTONS: CallButton[] = [
  {
    kind: "waiter",
    icon: "waiter",
    label: ["Appeler un serveur", "Appeler un serveur"],
    sent: ["Serveur prévenu", "Serveur prévenu"],
    toast: "Un serveur arrive, merci de patienter.",
  },
  {
    kind: "bill",
    icon: "receipt",
    label: ["L'addition", "Demander l'addition"],
    sent: ["Demandée", "Addition demandée"],
    toast: "On vous apporte l'addition.",
  },
];

/** Durée d'affichage de la notification. */
const TOAST_MS = 2600;

/** Durée d'affichage de la confirmation, avant de pouvoir rappeler. */
const SENT_DISPLAY_MS = 60_000;

/** « Appeler un serveur » / « L'addition » : s'affiche avec un son sur l'écran du bar. */
export function CallButtons({ token }: { token: string }) {
  const [sent, setSent] = useState<Partial<Record<CallKind, boolean>>>({});
  const [pending, setPending] = useState<CallKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      setToast(BUTTONS.find((button) => button.kind === kind)?.toast ?? null);
      window.setTimeout(() => setToast(null), TOAST_MS);
      window.setTimeout(() => setSent((current) => ({ ...current, [kind]: false })), SENT_DISPLAY_MS);
    } catch {
      setError("Pas de connexion. Faites signe à un serveur.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        {BUTTONS.map(({ kind, icon, label, sent: sentLabel }) => (
          <button
            key={kind}
            type="button"
            onClick={() => call(kind)}
            disabled={pending !== null && pending !== kind}
            aria-live="polite"
            aria-label={sent[kind] ? sentLabel[1] : label[1]}
            className={`btn !px-4 ${sent[kind] ? "border-transparent bg-ok-soft text-ok" : "btn--ghost bg-card"}`}
          >
            <Icon name={sent[kind] ? "check" : icon} />
            <span>{pending === kind ? "Envoi…" : sent[kind] ? sentLabel[0] : label[0]}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {error}
        </p>
      )}
      {toast && (
        <div role="status" className="toast">
          <strong>C&apos;est noté !</strong> {toast}
        </div>
      )}
    </div>
  );
}
