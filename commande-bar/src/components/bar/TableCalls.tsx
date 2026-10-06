"use client";

import { Icon, type IconName } from "@/components/Icon";
import { formatTime } from "@/lib/format";
import type { CallKind, TableCall } from "@/lib/order-types";

const CALL_TEXT: Record<CallKind, { icon: IconName; badge: string; badgeClass: string; text: string }> = {
  waiter: { icon: "waiter", badge: "Appel", badgeClass: "badge--info", text: "appelle un serveur" },
  bill: { icon: "receipt", badge: "Addition", badgeClass: "badge--gold", text: "demande l'addition" },
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
    <section aria-label="Appels des tables" className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {calls.map((call) => {
        const { icon, badge, badgeClass, text } = CALL_TEXT[call.kind];
        const minutes = Math.max(0, Math.floor((now - Date.parse(call.created_at)) / 60_000));
        return (
          <article
            key={call.id}
            className="card flex items-center gap-4 !p-4 animate-[arrive_.35s_var(--ease),halo_2.2s_var(--ease)_.4s_infinite]"
          >
            <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sand-2 text-ink">
              <Icon name={icon} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <span className={`badge ${badgeClass}`}>{badge}</span>
              <p className="mt-1 break-words font-serif text-[30px] font-semibold leading-none">{call.table_label}</p>
              <p className="mt-1 font-semibold">{text}</p>
              <p className="text-[13px] text-ink-2">
                {minutes < 1 ? "à l'instant" : `${formatTime(call.created_at, timeZone)} · il y a ${minutes} min`}
              </p>
            </div>
            <button type="button" onClick={() => onDone(call)} className="btn btn--primary shrink-0">
              <Icon name="check" />
              Fait
            </button>
          </article>
        );
      })}
    </section>
  );
}
