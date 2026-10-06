"use client";

import { formatTime } from "@/lib/format";
import type { CallKind, TableCall } from "@/lib/order-types";

const CALL_TEXT: Record<CallKind, { icon: string; text: string; className: string }> = {
  waiter: { icon: "🙋", text: "appelle un serveur", className: "bg-violet-600" },
  bill: { icon: "🧾", text: "demande l'addition", className: "bg-sky-600" },
};

/** Tables qui appellent un serveur ou demandent l'addition. */
export function TableCalls({
  calls,
  now,
  timeZone,
  onDone,
}: {
  calls: TableCall[];
  now: number;
  timeZone: string;
  onDone: (call: TableCall) => void;
}) {
  return (
    <section aria-label="Appels des tables" className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {calls.map((call) => {
        const { icon, text, className } = CALL_TEXT[call.kind];
        const minutes = Math.max(0, Math.floor((now - Date.parse(call.created_at)) / 60_000));
        return (
          <article key={call.id} className={`flex items-center gap-4 rounded-3xl p-4 text-white shadow ${className}`}>
            <span aria-hidden className="text-4xl">
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-3xl font-black leading-tight">{call.table_label}</p>
              <p className="text-lg font-semibold">{text}</p>
              <p className="text-base opacity-90">
                {minutes < 1 ? "à l'instant" : `${formatTime(call.created_at, timeZone)} · il y a ${minutes} min`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDone(call)}
              className="h-14 shrink-0 rounded-2xl bg-white px-5 text-xl font-bold text-stone-900 active:scale-[0.98]"
            >
              ✓ Fait
            </button>
          </article>
        );
      })}
    </section>
  );
}
