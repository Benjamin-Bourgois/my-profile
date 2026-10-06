"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { signOut } from "@/app/connexion/actions";
import { HistoryRow, OrderCard, type OrderActions } from "@/components/bar/OrderCard";
import { TableCalls } from "@/components/bar/TableCalls";
import { PauseOrdersButton } from "@/components/PauseOrdersButton";
import { keepScreenOn, loadSounds, playSound, unlockSounds, type BarSounds, type SoundName } from "@/lib/bar-alerts";
import { formatTime } from "@/lib/format";
import type { BarOrder, BarOrders, OrderStatus, TableCall } from "@/lib/order-types";
import type { StaffVenue } from "@/lib/staff";
import { getBrowserClient } from "@/lib/supabase/browser";

/** Filet de sécurité : relecture complète même si le temps réel est coupé. */
const POLL_INTERVAL = 20_000;

/** Rappel sonore tant qu'une commande reste « Nouvelle » ou qu'un appel attend. */
const REMINDER_INTERVAL = 60_000;

/** Durée du son « nouvelle commande », avant de jouer celui d'un appel. */
const ORDER_SOUND_MS = 2200;

/** Applique tout de suite un changement à l'écran, avant la confirmation de la base. */
function applyLocally(data: BarOrders, orderId: string, change: Partial<BarOrder>): BarOrders {
  const order = [...data.active, ...data.history].find((o) => o.id === orderId);
  if (!order) return data;
  const updated = { ...order, ...change };
  const active = data.active.filter((o) => o.id !== orderId);
  const history = data.history.filter((o) => o.id !== orderId);
  if (updated.status === "received" || updated.status === "preparing") active.push(updated);
  else history.unshift(updated);
  active.sort((a, b) => (a.received_at ?? "").localeCompare(b.received_at ?? "") || a.order_number - b.order_number);
  return { ...data, active, history };
}

export function BarScreen({ venue }: { venue: StaffVenue }) {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserClient(), []);
  const [data, setData] = useState<BarOrders | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  /** « lost » : l'appareil a coupé le son (mise en veille…), il faut toucher l'écran. */
  const [sound, setSound] = useState<"off" | "on" | "lost">("off");
  const [view, setView] = useState<"active" | "history">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const clockOffset = useRef(0);
  const seenIds = useRef<Set<string> | null>(null);
  const seenCallIds = useRef<Set<string> | null>(null);
  const sounds = useRef<BarSounds | null>(null);
  const dataRef = useRef<BarOrders | null>(null);
  const refreshTimeout = useRef<number | undefined>(undefined);

  const ring = useCallback(async (name: SoundName) => {
    if (!sounds.current) return;
    if (!(await playSound(sounds.current, name))) setSound("lost");
  }, []);

  const refresh = useCallback(async () => {
    const { data: result, error: rpcError } = await supabase.rpc("get_bar_orders", { p_venue_id: venue.id });
    if (rpcError) {
      if (/jwt|token|PGRST30/i.test(`${rpcError.code} ${rpcError.message}`)) {
        router.push("/connexion?next=/bar");
        return;
      }
      setError(
        rpcError.message === "ACCES_REFUSE"
          ? "Ce compte n'a pas accès à ce bar."
          : "Impossible de charger les commandes. Nouvel essai automatique…",
      );
      return;
    }

    // Valeurs par défaut si le script supabase/5-ajouts.sql n'a pas encore été exécuté.
    const raw = result as Partial<BarOrders> & Omit<BarOrders, "orders_paused" | "calls">;
    const orders: BarOrders = { ...raw, orders_paused: raw.orders_paused ?? false, calls: raw.calls ?? [] };
    clockOffset.current = Date.parse(orders.server_time) - Date.now();
    // Signal sonore pour chaque commande ou appel jamais vu (pas au premier chargement).
    if (seenIds.current && seenCallIds.current) {
      const orderArrived = orders.active.some((order) => !seenIds.current?.has(order.id));
      const callArrived = orders.calls.some((call) => !seenCallIds.current?.has(call.id));
      if (orderArrived) ring("commande");
      if (callArrived) window.setTimeout(() => ring("appel"), orderArrived ? ORDER_SOUND_MS : 0);
    }
    seenIds.current = new Set([...orders.active, ...orders.history].map((order) => order.id));
    seenCallIds.current = new Set(orders.calls.map((call) => call.id));
    setData(orders);
    setError(null);
    setNow(Date.now() + clockOffset.current);
  }, [ring, router, supabase, venue.id]);

  /** Plusieurs changements rapprochés → une seule relecture. */
  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimeout.current);
    refreshTimeout.current = window.setTimeout(refresh, 300);
  }, [refresh]);

  // Chargement, relecture régulière, et relecture au retour sur l'onglet.
  useEffect(() => {
    scheduleRefresh();
    const poll = window.setInterval(refresh, POLL_INTERVAL);
    const tick = window.setInterval(() => setNow(Date.now() + clockOffset.current), 15_000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      scheduleRefresh();
      if (sounds.current) keepScreenOn();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      window.clearTimeout(refreshTimeout.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, scheduleRefresh]);

  // Temps réel : la base prévient dès qu'une commande du bar change.
  useEffect(() => {
    let channel: RealtimeChannel | undefined;
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session) await supabase.realtime.setAuth(auth.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`commandes-${venue.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `venue_id=eq.${venue.id}` },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "table_calls", filter: `venue_id=eq.${venue.id}` },
          scheduleRefresh,
        )
        .subscribe((status) => {
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") scheduleRefresh();
        });
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, venue.id, scheduleRefresh]);

  useEffect(() => {
    loadSounds();
  }, []);

  // Rappel sonore : commande toujours « Nouvelle » ou appel non traité depuis 1 minute.
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = dataRef.current;
      if (!current) return;
      const at = Date.now() + clockOffset.current;
      const forgotten = (iso: string | null) => iso !== null && at - Date.parse(iso) >= REMINDER_INTERVAL;
      if (current.active.some((order) => order.status === "received" && forgotten(order.received_at))) ring("commande");
      else if (current.calls.some((call) => forgotten(call.created_at))) ring("appel");
    }, REMINDER_INTERVAL);
    return () => window.clearInterval(timer);
  }, [ring]);

  // Nombre de nouvelles commandes et d'appels dans l'onglet du navigateur.
  const newCount = (data?.active.filter((order) => order.status === "received").length ?? 0) + (data?.calls.length ?? 0);
  useEffect(() => {
    document.title = newCount > 0 ? `(${newCount}) Bar · ${venue.name}` : `Bar · ${venue.name}`;
  }, [newCount, venue.name]);

  /** Appui sur « Activer le son » : débloque les sons et joue le « ding-dong » pour tester. */
  async function enableSound() {
    try {
      sounds.current = await unlockSounds();
      setSound("on");
      keepScreenOn();
    } catch {
      setError("Le son n'a pas pu démarrer. Touchez à nouveau « Activer le son ».");
    }
  }

  async function run(order: BarOrder, change: Partial<BarOrder>, call: () => PromiseLike<{ error: unknown }>) {
    setBusyId(order.id);
    setData((current) => (current ? applyLocally(current, order.id, change) : current));
    const { error: callError } = await call();
    if (callError) setError(`La commande n° ${order.order_number} n'a pas pu être modifiée. Réessayez.`);
    setBusyId(null);
    refresh();
  }

  async function handleCall(call: TableCall) {
    setData((current) => (current ? { ...current, calls: current.calls.filter((c) => c.id !== call.id) } : current));
    const { error: callError } = await supabase.rpc("handle_table_call", { p_call_id: call.id });
    if (callError) setError(`L'appel de ${call.table_label} n'a pas pu être marqué comme fait. Réessayez.`);
    refresh();
  }

  async function setPaused(paused: boolean) {
    setData((current) => (current ? { ...current, orders_paused: paused } : current));
    const { error: pauseError } = await supabase.rpc("set_orders_paused", { p_venue_id: venue.id, p_paused: paused });
    if (pauseError) setError("La pause des commandes n'a pas pu être modifiée. Réessayez.");
    refresh();
  }

  const actions: OrderActions = {
    onStatus: (order, status: OrderStatus) =>
      run(order, { status }, () => supabase.rpc("set_order_status", { p_order_id: order.id, p_status: status })),
    onPaid: (order) =>
      run(order, { payment_status: "paid" }, () => supabase.rpc("mark_order_paid_by_staff", { p_order_id: order.id })),
    onCancel: (order) => {
      if (!window.confirm(`Annuler la commande n° ${order.order_number} (${order.table_label}) ?`)) return;
      run(order, { status: "cancelled" }, () =>
        supabase.rpc("set_order_status", { p_order_id: order.id, p_status: "cancelled" }),
      );
    },
  };

  const waitMinutes = (order: BarOrder) =>
    Math.max(0, Math.floor((now - Date.parse(order.received_at ?? order.created_at)) / 60_000));

  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="sticky top-0 z-10 bg-stone-900 text-white shadow">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <h1 className="text-xl font-bold">{venue.name}</h1>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${live ? "bg-green-600" : "bg-stone-700 text-stone-300"}`}
            title={live ? "Les commandes arrivent instantanément" : "Actualisation toutes les 20 secondes"}
          >
            {live ? "● En direct" : "○ Actualisation auto"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {data && <span className="text-2xl font-bold tabular-nums">{formatTime(new Date(now).toISOString(), venue.timezone)}</span>}
            {data && <PauseOrdersButton paused={data.orders_paused} onToggle={setPaused} />}
            <button
              type="button"
              onClick={enableSound}
              title="Toucher pour tester le son"
              className="h-11 rounded-xl bg-stone-700 px-4 font-semibold active:bg-stone-600"
            >
              {sound === "on" ? "🔔 Son activé" : "🔇 Activer le son"}
            </button>
            {venue.role === "owner" && (
              <Link href="/admin" className="flex h-11 items-center rounded-xl px-3 font-semibold text-stone-300 underline">
                Espace gérant
              </Link>
            )}
            <form action={signOut}>
              <button type="submit" className="h-11 rounded-xl px-3 text-stone-300 underline">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-2 px-4 pb-3" aria-label="Affichage">
          <TabButton active={view === "active"} onClick={() => setView("active")}>
            À préparer ({data?.active.length ?? 0})
          </TabButton>
          <TabButton active={view === "history"} onClick={() => setView("history")}>
            Historique du jour ({data?.history.length ?? 0})
          </TabButton>
        </nav>
      </header>

      {data?.orders_paused && (
        <p role="status" className="bg-red-600 px-4 py-3 text-lg font-bold text-white">
          Commandes en pause : les clients ne peuvent plus commander depuis leur téléphone.
        </p>
      )}

      {sound !== "on" && (
        <button
          type="button"
          onClick={enableSound}
          className="block w-full bg-amber-400 px-4 py-4 text-lg font-bold text-stone-900 active:bg-amber-500"
        >
          {sound === "lost"
            ? "🔇 L'appareil a coupé le son : touchez ici pour le réactiver"
            : "🔔 Touchez ici pour activer le son des nouvelles commandes et des appels"}
        </button>
      )}

      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-xl bg-red-100 px-4 py-3 text-lg text-red-900">
          {error}
        </p>
      )}

      <main className="p-4">
        {data && data.calls.length > 0 && (
          <TableCalls calls={data.calls} now={now} timeZone={venue.timezone} onDone={handleCall} />
        )}
        {!data ? (
          <p className="py-24 text-center text-xl text-stone-500">Chargement des commandes…</p>
        ) : view === "active" ? (
          data.active.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-6xl">🍸</p>
              <p className="mt-4 text-2xl font-bold text-stone-700">Aucune commande en attente</p>
              <p className="mt-2 text-lg text-stone-500">Les nouvelles commandes apparaîtront ici automatiquement.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.active.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  waitMinutes={waitMinutes(order)}
                  busy={busyId === order.id}
                  timeZone={venue.timezone}
                  actions={actions}
                />
              ))}
            </div>
          )
        ) : data.history.length === 0 ? (
          <p className="py-24 text-center text-xl text-stone-500">Aucune commande servie aujourd&apos;hui.</p>
        ) : (
          <ul className="space-y-3">
            {data.history.map((order) => (
              <HistoryRow key={order.id} order={order} busy={busyId === order.id} timeZone={venue.timezone} actions={actions} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 rounded-xl px-4 text-base font-bold ${active ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300"}`}
    >
      {children}
    </button>
  );
}
