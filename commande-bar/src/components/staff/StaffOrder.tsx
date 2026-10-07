"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { QuantityStepper } from "@/components/menu/QuantityStepper";
import { Sheet, SheetBody, SheetFooter } from "@/components/Sheet";
import { VenueMark } from "@/components/VenueMark";
import { formatPrice } from "@/lib/format";
import { GENERIC_ORDER_ERROR, isKnownOrderError, orderError } from "@/lib/order-errors";
import { MAX_COMMENT_LENGTH, MAX_QUANTITY_PER_LINE } from "@/lib/order-types";
import type { StaffVenue } from "@/lib/staff";
import { getBrowserClient } from "@/lib/supabase/browser";

export type StaffProduct = {
  id: string;
  name: string;
  price_cents: number;
  is_available: boolean;
  /** Unités encore vendables (null : stock non suivi). */
  remaining: number | null;
};

export type StaffMenu = {
  tables: { id: string; label: string }[];
  categories: { id: string; name: string; products: StaffProduct[] }[];
};

const COUNTER = "comptoir";
const TOAST_MS = 3000;

const canSell = (p: StaffProduct) => p.is_available && (p.remaining === null || p.remaining > 0);
const maxFor = (p: StaffProduct) => Math.min(MAX_QUANTITY_PER_LINE, p.remaining ?? MAX_QUANTITY_PER_LINE);

/** Prise de commande par un serveur : table, articles, encaissé ou non. */
export function StaffOrder({ venue, initialMenu }: { venue: StaffVenue; initialMenu: StaffMenu }) {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserClient(), []);
  const [menu, setMenu] = useState(initialMenu);
  const [table, setTable] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [paid, setPaid] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const products = useMemo(
    () => new Map(menu.categories.flatMap((c) => c.products).map((p) => [p.id, p])),
    [menu],
  );
  const lines = Object.entries(cart).flatMap(([id, quantity]) => {
    const product = products.get(id);
    return product && quantity > 0 ? [{ product, quantity: Math.min(quantity, maxFor(product)) }] : [];
  });
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + l.quantity * l.product.price_cents, 0);
  const tableLabel = table === COUNTER ? "Comptoir" : menu.tables.find((t) => t.id === table)?.label;

  const setQuantity = useCallback((id: string, quantity: number) => {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }, []);

  async function reloadMenu() {
    const { data } = await supabase.rpc("get_staff_menu", { p_venue_id: venue.id });
    if (data) setMenu(data as StaffMenu);
  }

  async function send() {
    if (!table || !lines.length) return;
    setSending(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("staff_create_order", {
      p_venue_id: venue.id,
      p_table_id: table === COUNTER ? null : table,
      p_items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      p_comment: comment.trim() || null,
      p_paid: paid,
    });
    setSending(false);
    if (rpcError) {
      if (/jwt|token|PGRST30/i.test(`${rpcError.code} ${rpcError.message}`)) {
        router.push("/connexion?next=/bar/commande");
        return;
      }
      setError(isKnownOrderError(rpcError.message) ? orderError(rpcError.message, rpcError.details).message : GENERIC_ORDER_ERROR);
      reloadMenu();
      return;
    }
    const created = data as { order_number: number };
    setToast(`Commande n° ${created.order_number} (${tableLabel}) envoyée au bar.`);
    window.setTimeout(() => setToast(null), TOAST_MS);
    setCart({});
    setComment("");
    setPaid(false);
    setTable(null);
    setReviewing(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    reloadMenu();
  }

  const closeReview = useCallback(() => setReviewing(false), []);

  return (
    <div className="min-h-dvh pb-32">
      <header className="sticky top-0 z-10 border-b border-line bg-[rgba(251,249,245,.9)] backdrop-blur-[14px] backdrop-saturate-[1.4]">
        <div className="mx-auto flex max-w-[680px] items-center gap-3 px-4 py-3">
          <Link href="/bar" aria-label="Retour à l'écran du bar" className="icon-btn">
            <Icon name="arrowLeft" />
          </Link>
          <VenueMark name={venue.name} logoUrl={venue.logo_url} size={36} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Prise de commande</p>
            <h1 className="truncate text-[22px]">{tableLabel ?? "Nouvelle commande"}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[680px] px-4">
        <section aria-labelledby="table-titre" className="pt-5">
          <h2 id="table-titre" className="field-label !font-sans">
            Pour quelle table ?
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {[{ id: COUNTER, label: "Comptoir" }, ...menu.tables].map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={table === t.id} onClick={() => setTable(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {menu.categories.map((category) => (
          <section key={category.id} className="pt-6">
            <h2 className="mb-2 text-[26px]">{category.name}</h2>
            <ul className="card divide-y divide-line !p-0">
              {category.products.map((product) => {
                const quantity = cart[product.id] ?? 0;
                const sellable = canSell(product);
                return (
                  <li key={product.id} className={`flex items-center gap-3 px-4 py-2.5 ${sellable ? "" : "opacity-55"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{product.name}</p>
                      <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                        <span className="font-bold tabular-nums">{formatPrice(product.price_cents)}</span>
                        <StockHint product={product} />
                      </p>
                    </div>
                    {sellable &&
                      (quantity > 0 ? (
                        <QuantityStepper
                          quantity={quantity}
                          label={product.name}
                          max={maxFor(product)}
                          onChange={(next) => setQuantity(product.id, next)}
                        />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Ajouter ${product.name}`}
                          onClick={() => setQuantity(product.id, 1)}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-matte text-white transition-transform duration-150 ease-chic hover:bg-matte-hover active:scale-90"
                        >
                          <Icon name="plus" />
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>

      {count > 0 && !reviewing && (
        <div className="fixed inset-x-0 bottom-[calc(16px+var(--safe-b))] z-20 px-4">
          <button
            key={count}
            type="button"
            onClick={() => setReviewing(true)}
            className="mx-auto flex h-[60px] w-full max-w-[648px] animate-[bump_.3s_var(--ease)] items-center justify-between gap-3 rounded-full bg-matte px-2.5 text-white shadow-float transition-colors hover:bg-matte-hover"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 min-w-10 place-items-center rounded-full bg-gold px-2 text-[15px] font-bold text-matte">{count}</span>
              <span className="text-[15px] font-semibold">Vérifier la commande</span>
            </span>
            <span className="rounded-full bg-white/12 px-4 py-2 text-[15px] font-bold tabular-nums">{formatPrice(total)}</span>
          </button>
        </div>
      )}

      {reviewing && (
        <Sheet title="Commande" eyebrow={tableLabel ?? "Table à choisir"} onClose={closeReview}>
          <SheetBody>
            {lines.length === 0 ? (
              <p className="py-10 text-center text-ink-2">Aucun article.</p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line bg-card px-4">
                {lines.map(({ product, quantity }) => (
                  <li key={product.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[20px] font-semibold leading-tight">{product.name}</p>
                      <p className="text-[13px] font-bold tabular-nums text-ink-2">{formatPrice(product.price_cents * quantity)}</p>
                    </div>
                    <QuantityStepper
                      quantity={quantity}
                      label={product.name}
                      max={maxFor(product)}
                      onChange={(next) => setQuantity(product.id, next)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {!table && (
              <div className="mt-5">
                <p className="field-label">Pour quelle table ?</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {[{ id: COUNTER, label: "Comptoir" }, ...menu.tables].map((t) => (
                    <button key={t.id} type="button" className="chip" aria-pressed={false} onClick={() => setTable(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="field mt-5">
              <span>Commentaire pour le bar (facultatif)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                rows={2}
                placeholder="Ex. : sans glace, en même temps que la table 4…"
                className="input resize-none"
              />
            </label>

            <fieldset className="mt-5">
              <legend className="field-label">Paiement</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button type="button" className="chip h-12 justify-center" aria-pressed={!paid} onClick={() => setPaid(false)}>
                  À encaisser
                </button>
                <button type="button" className="chip h-12 justify-center" aria-pressed={paid} onClick={() => setPaid(true)}>
                  Déjà encaissé
                </button>
              </div>
            </fieldset>
          </SheetBody>
          <SheetFooter>
            {error && (
              <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={send}
              disabled={sending || !table || lines.length === 0}
              className="btn btn--primary btn--block"
            >
              {sending ? "Envoi…" : table ? `Envoyer au bar · ${formatPrice(total)}` : "Choisissez une table"}
            </button>
          </SheetFooter>
        </Sheet>
      )}

      {toast && (
        <div role="status" className="toast">
          <strong>C&apos;est envoyé !</strong> {toast}
        </div>
      )}
    </div>
  );
}

function StockHint({ product }: { product: StaffProduct }) {
  if (!product.is_available) return <span className="badge badge--danger">Épuisé</span>;
  if (product.remaining === null) return null;
  if (product.remaining <= 0) return <span className="badge badge--danger">Rupture de stock</span>;
  if (product.remaining <= 5) return <span className="badge badge--warn">Reste {product.remaining}</span>;
  return <span className="text-[12px] text-muted">Stock : {product.remaining}</span>;
}
