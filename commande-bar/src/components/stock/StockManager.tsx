"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { signOut } from "@/app/connexion/actions";
import { Icon, type IconName } from "@/components/Icon";
import { Sheet, SheetBody, SheetFooter } from "@/components/Sheet";
import { VenueMark } from "@/components/VenueMark";
import { adminErrorMessage } from "@/lib/admin-errors";
import type { StaffVenue } from "@/lib/staff";
import {
  daysLeft,
  formatQuantity,
  MOVEMENT_LABEL,
  parseQuantity,
  STOCK_UNITS,
  type StockData,
  type StockItem,
  type StockMovement,
  type StockMovementKind,
  type StockUnit,
} from "@/lib/stock";
import { riseStyle } from "@/lib/style";
import { getBrowserClient } from "@/lib/supabase/browser";

type Filter = "all" | "low" | "out";
type Move = "delivery" | "loss" | "count";
type Panel =
  | { type: "move"; item: StockItem; kind: Move }
  | { type: "history"; item: StockItem }
  | { type: "edit"; item: StockItem | null };

const TOAST_MS = 2600;

const MOVE_TEXT: Record<Move, { title: string; field: string; note: string; button: string; done: string; icon: IconName }> = {
  delivery: {
    title: "Livraison reçue",
    field: "Quantité reçue",
    note: "Ex. : fournisseur, numéro du bon de livraison",
    button: "Enregistrer la livraison",
    done: "Livraison enregistrée",
    icon: "truck",
  },
  loss: {
    title: "Perte ou casse",
    field: "Quantité perdue",
    note: "Ex. : bouteille cassée, périmé, offert",
    button: "Enregistrer la perte",
    done: "Perte enregistrée",
    icon: "minus",
  },
  count: {
    title: "Inventaire",
    field: "Quantité comptée",
    note: "Ex. : inventaire du lundi",
    button: "Enregistrer l'inventaire",
    done: "Inventaire enregistré",
    icon: "clipboard",
  },
};

const UNIT_HINT: Partial<Record<StockUnit, string>> = {
  L: "En litres : un fût de 30 L = 30, un demi = 0,25.",
  cl: "En centilitres : une bouteille de 70 cl = 70.",
  kg: "En kilos : 500 g = 0,5.",
};

/** Page « Stocks » : tout le personnel saisit livraisons, pertes et inventaires ; le gérant gère les articles. */
export function StockManager({ venue, initial }: { venue: StaffVenue; initial: StockData }) {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserClient(), []);
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const counts = {
    all: data.items.length,
    low: data.items.filter((i) => i.status === "low").length,
    out: data.items.filter((i) => i.status === "out").length,
  };
  const query = search.trim().toLowerCase();
  const items = data.items.filter(
    (i) =>
      (filter === "all" || i.status === filter || (filter === "low" && i.status === "out")) &&
      (!query || i.name.toLowerCase().includes(query) || i.used_by.some((u) => u.name.toLowerCase().includes(query))),
  );

  const refresh = useCallback(async () => {
    const { data: fresh, error } = await supabase.rpc("get_stock", { p_venue_id: venue.id });
    if (error && /jwt|token|PGRST30/i.test(`${error.code} ${error.message}`)) router.push("/connexion?next=/stocks");
    if (fresh) setData(fresh as StockData);
  }, [router, supabase, venue.id]);

  // Les ventes font bouger le stock : relecture régulière et au retour sur l'onglet.
  useEffect(() => {
    const timer = window.setInterval(refresh, 30_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  function done(message: string) {
    setPanel(null);
    setToast(message);
    window.setTimeout(() => setToast(null), TOAST_MS);
    refresh();
  }

  const closePanel = useCallback(() => setPanel(null), []);

  return (
    <div className="min-h-dvh pb-16">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
            <VenueMark name={venue.name} logoUrl={venue.logo_url} size={40} />
            <div className="min-w-0">
              <p className="eyebrow">Stocks</p>
              <h1 className="truncate text-[24px]">{venue.name}</h1>
            </div>
          </div>
          <div className="order-last flex w-full flex-wrap items-center gap-2 md:order-none md:ml-auto md:w-auto">
            <Link href="/bar" className="btn btn--ghost btn--sm">
              <Icon name="arrowLeft" size={16} />
              Écran du bar
            </Link>
            {data.is_owner && (
              <Link href="/admin" className="btn btn--ghost btn--sm">
                Espace gérant
              </Link>
            )}
          </div>
          <form action={signOut}>
            <button type="submit" aria-label="Déconnexion" title="Déconnexion" className="icon-btn">
              <Icon name="logout" size={17} />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="text-[30px]">Stocks</h2>
            <p className="text-ink-2">Le stock baisse tout seul à chaque commande et remonte si elle est annulée.</p>
          </div>
          {data.is_owner && (
            <button type="button" onClick={() => setPanel({ type: "edit", item: null })} className="btn btn--primary btn--sm">
              <Icon name="plus" size={16} />
              Nouvel article
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            Tous ({counts.all})
          </button>
          <button type="button" className="chip" aria-pressed={filter === "low"} onClick={() => setFilter("low")}>
            À commander ({counts.low + counts.out})
          </button>
          <button type="button" className="chip" aria-pressed={filter === "out"} onClick={() => setFilter("out")}>
            Épuisés ({counts.out})
          </button>
          <label className="relative ml-auto w-full sm:w-64">
            <span className="sr-only">Rechercher un article ou un produit</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="input !rounded-full !pl-10"
            />
          </label>
        </div>

        {data.items.length === 0 ? (
          <div className="card !p-8 text-center">
            <p className="font-serif text-[24px] font-semibold">Aucun article en stock pour l&apos;instant</p>
            <p className="mx-auto mt-2 max-w-lg text-ink-2">
              {data.is_owner
                ? "Créez vos articles (fût de bière, bouteilles, citrons, portions…), puis reliez-les aux produits de la carte : Espace gérant → Carte → Modifier → Stock."
                : "Le gérant n'a pas encore créé d'articles de stock."}
            </p>
          </div>
        ) : items.length === 0 ? (
          <p className="card !p-8 text-center text-ink-2">Aucun article ne correspond.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {items.map((item, index) => (
              <StockCard
                key={item.id}
                item={item}
                index={index}
                isOwner={data.is_owner}
                onMove={(kind) => setPanel({ type: "move", item, kind })}
                onHistory={() => setPanel({ type: "history", item })}
                onEdit={() => setPanel({ type: "edit", item })}
              />
            ))}
          </ul>
        )}

        <details className="card bg-sand-2 !p-4">
          <summary className="font-semibold">Comment ça marche ?</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-2">
            <li>
              Chaque produit de la carte peut consommer un ou plusieurs articles (ex. : un Mojito = 5 cl de rhum + 1 citron vert).
              Le gérant le règle dans Espace gérant → Carte → Modifier.
            </li>
            <li>À chaque commande (client ou serveur), le stock baisse automatiquement ; il remonte si la commande est annulée.</li>
            <li>Quand il ne reste plus assez d&apos;un article, les produits qui l&apos;utilisent passent « Épuisé » sur la carte des clients.</li>
            <li>
              <strong className="text-ink">Livraison</strong> ajoute au stock, <strong className="text-ink">Perte</strong> le retire,{" "}
              <strong className="text-ink">Inventaire</strong> le remplace par la quantité comptée. Tout est noté dans l&apos;historique.
            </li>
          </ul>
        </details>
      </main>

      {panel?.type === "move" && <MoveSheet item={panel.item} kind={panel.kind} onClose={closePanel} onDone={done} />}
      {panel?.type === "history" && <HistorySheet item={panel.item} timeZone={venue.timezone} onClose={closePanel} />}
      {panel?.type === "edit" && <EditSheet venueId={venue.id} item={panel.item} onClose={closePanel} onDone={done} />}

      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: StockItem["status"] }) {
  if (status === "out") return <span className="badge badge--danger">Épuisé</span>;
  if (status === "low") return <span className="badge badge--warn">À commander</span>;
  return null;
}

function StockCard({
  item,
  index,
  isOwner,
  onMove,
  onHistory,
  onEdit,
}: {
  item: StockItem;
  index: number;
  isOwner: boolean;
  onMove: (kind: Move) => void;
  onHistory: () => void;
  onEdit: () => void;
}) {
  const days = daysLeft(item);
  return (
    <li
      className={`card rise flex flex-col gap-3 !p-4 ${item.status === "out" ? "!border-danger" : item.status === "low" ? "!border-warn" : ""}`}
      style={riseStyle(index)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-[22px]">{item.name}</h3>
          <div className="mt-1">
            <StatusBadge status={item.status} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-serif text-[30px] font-semibold leading-none ${item.status === "out" ? "text-danger" : ""}`}>
            {formatQuantity(item.quantity, item.unit)}
          </p>
          {item.alert_threshold !== null && (
            <p className="mt-1 text-[12px] text-muted">Alerte sous {formatQuantity(item.alert_threshold, item.unit)}</p>
          )}
        </div>
      </div>

      <div className="space-y-0.5 text-[13px] text-ink-2">
        <p>
          Vendu sur 7 jours : <strong className="text-ink">{formatQuantity(item.sold_7d, item.unit)}</strong>
          {days !== null && (
            <span className={days <= 3 ? "font-semibold text-danger" : ""}>
              {" "}
              · environ {days} jour{days > 1 ? "s" : ""} de stock
            </span>
          )}
        </p>
        <p className="text-muted">
          {item.used_by.length
            ? `Utilisé par : ${item.used_by.map((u) => `${u.name} : ${formatQuantity(u.quantity, item.unit)}`).join(" · ")}`
            : "Relié à aucun produit de la carte"}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onMove("delivery")} className="btn btn--soft btn--sm">
          <Icon name="truck" size={15} />
          Livraison
        </button>
        <button type="button" onClick={() => onMove("loss")} className="btn btn--ghost btn--sm">
          <Icon name="minus" size={15} />
          Perte
        </button>
        <button type="button" onClick={() => onMove("count")} className="btn btn--ghost btn--sm">
          <Icon name="clipboard" size={15} />
          Inventaire
        </button>
        <button type="button" onClick={onHistory} className="btn btn--ghost btn--sm">
          <Icon name="clock" size={15} />
          Historique
        </button>
        {isOwner && (
          <button type="button" onClick={onEdit} aria-label={`Modifier ${item.name}`} title="Modifier" className="icon-btn !h-9 !w-9">
            <Icon name="pencil" size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function MoveSheet({
  item,
  kind,
  onClose,
  onDone,
}: {
  item: StockItem;
  kind: Move;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const text = MOVE_TEXT[kind];
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantity = value.trim() ? parseQuantity(value) : null;
  const preview =
    quantity === null
      ? null
      : kind === "delivery"
        ? Number(item.quantity) + quantity
        : kind === "loss"
          ? Number(item.quantity) - quantity
          : quantity;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (quantity === null || (kind !== "count" && quantity === 0)) {
      setError("Quantité invalide : écrivez un nombre, par exemple 12 ou 0,5.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("stock_record", {
      p_item_id: item.id,
      p_kind: kind,
      p_quantity: quantity,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (rpcError) {
      setError(adminErrorMessage(rpcError));
      return;
    }
    onDone(`${text.done} : ${item.name} → ${formatQuantity(Number(data), item.unit)}`);
  }

  return (
    <Sheet title={text.title} eyebrow={item.name} onClose={onClose}>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <SheetBody>
          <p className="text-ink-2">
            Stock actuel : <strong className="text-ink">{formatQuantity(item.quantity, item.unit)}</strong>
          </p>
          <label className="field mt-4">
            <span>
              {text.field} ({item.unit})
            </span>
            <input
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "count" ? String(Number(item.quantity)).replace(".", ",") : "Ex. : 12"}
              className="input text-[20px] tabular-nums"
            />
          </label>
          {UNIT_HINT[item.unit] && <p className="mt-1.5 text-[13px] text-muted">{UNIT_HINT[item.unit]}</p>}
          <label className="field mt-4">
            <span>Note (facultatif)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={text.note} className="input" />
          </label>
          {preview !== null && (
            <p className="mt-4 rounded-md border border-line bg-card px-4 py-3">
              Nouveau stock :{" "}
              <strong className={`font-serif text-[22px] ${preview < 0 ? "text-danger" : ""}`}>{formatQuantity(preview, item.unit)}</strong>
            </p>
          )}
        </SheetBody>
        <SheetFooter>
          {error && (
            <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={saving || !value.trim()} className="btn btn--primary btn--block">
            <Icon name={text.icon} />
            {saving ? "Enregistrement…" : text.button}
          </button>
        </SheetFooter>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

const KIND_ICON: Record<StockMovementKind, IconName> = {
  sale: "glass",
  sale_cancel: "undo",
  delivery: "truck",
  loss: "minus",
  count: "clipboard",
  adjust: "pencil",
};

function HistorySheet({ item, timeZone, onClose }: { item: StockItem; timeZone: string; onClose: () => void }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }),
    [timeZone],
  );

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_stock_history", { p_item_id: item.id, p_limit: 50 }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) setError(adminErrorMessage(rpcError));
      else setMovements((data ?? []) as StockMovement[]);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, supabase]);

  return (
    <Sheet title="Historique" eyebrow={item.name} onClose={onClose}>
      <SheetBody>
        {error && <p className="rounded-md bg-danger-soft px-4 py-3 text-danger">{error}</p>}
        {!movements && !error && <p className="py-10 text-center text-ink-2">Chargement…</p>}
        {movements?.length === 0 && <p className="py-10 text-center text-ink-2">Aucun mouvement pour l&apos;instant.</p>}
        {movements && movements.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line bg-card px-4">
            {movements.map((m) => {
              const delta = Number(m.delta);
              return (
                <li key={m.id} className="flex items-start gap-3 py-3">
                  <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sand-2 text-ink-2">
                    <Icon name={KIND_ICON[m.kind]} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">
                      {MOVEMENT_LABEL[m.kind]}
                      {m.order_number !== null && ` · n° ${m.order_number}${m.table_label ? ` (${m.table_label})` : ""}`}
                    </p>
                    <p className="text-[12px] text-muted">
                      {dateFormat.format(new Date(m.created_at))}
                      {m.author && ` · ${m.author}`}
                    </p>
                    {m.note && <p className="text-[13px] text-ink-2">« {m.note} »</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-bold tabular-nums ${delta > 0 ? "text-ok" : delta < 0 ? "" : "text-muted"}`}>
                      {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                      {formatQuantity(Math.abs(delta), item.unit)}
                    </p>
                    <p className="text-[12px] tabular-nums text-muted">→ {formatQuantity(m.quantity_after, item.unit)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SheetBody>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function EditSheet({
  venueId,
  item,
  onClose,
  onDone,
}: {
  venueId: string;
  item: StockItem | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? "unité");
  const [threshold, setThreshold] = useState(item?.alert_threshold != null ? String(Number(item.alert_threshold)).replace(".", ",") : "");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const thresholdValue = threshold.trim() ? parseQuantity(threshold) : null;
    const quantityValue = quantity.trim() ? parseQuantity(quantity) : 0;
    if ((threshold.trim() && thresholdValue === null) || quantityValue === null) {
      setError("Quantité invalide : écrivez un nombre, par exemple 12 ou 0,5.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_save_stock_item", {
      p_venue_id: venueId,
      p_item: { id: item?.id ?? null, name, unit, alert_threshold: thresholdValue, quantity: item ? null : quantityValue },
    });
    setSaving(false);
    if (rpcError) {
      setError(adminErrorMessage(rpcError));
      return;
    }
    onDone(item ? `Article « ${name.trim()} » modifié` : `Article « ${name.trim()} » créé`);
  }

  async function remove() {
    if (!item) return;
    if (!window.confirm(`Supprimer « ${item.name} » ?\n\nSon historique sera effacé et les produits qui l'utilisent ne seront plus décomptés.`)) return;
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("admin_delete_stock_item", { p_item_id: item.id });
    setSaving(false);
    if (rpcError) {
      setError(adminErrorMessage(rpcError));
      return;
    }
    onDone(`Article « ${item.name} » supprimé`);
  }

  return (
    <Sheet title={item ? "Modifier l'article" : "Nouvel article"} eyebrow="Stocks" onClose={onClose}>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <SheetBody>
          <div className="grid gap-4">
            <label className="field">
              <span>Nom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ex. : Bière blonde (fût), Rhum blanc, Citron vert" className="input" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                <span>Unité</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value as StockUnit)} className="input">
                  {STOCK_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Alerte sous (facultatif)</span>
                <input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Ex. : 10" className="input" />
              </label>
            </div>
            {!item && (
              <label className="field">
                <span>Stock actuel ({unit})</span>
                <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="input" />
              </label>
            )}
            {UNIT_HINT[unit] && <p className="-mt-2 text-[13px] text-muted">{UNIT_HINT[unit]}</p>}
            <p className="text-[13px] text-ink-2">
              Pour que le stock baisse à chaque vente, reliez ensuite l&apos;article aux produits : Espace gérant → Carte → Modifier → Stock.
            </p>
          </div>
        </SheetBody>
        <SheetFooter>
          {error && (
            <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            {item && (
              <button type="button" onClick={remove} disabled={saving} className="btn btn--danger">
                Supprimer
              </button>
            )}
            <button type="submit" disabled={saving} className="btn btn--primary flex-1">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </SheetFooter>
      </form>
    </Sheet>
  );
}
