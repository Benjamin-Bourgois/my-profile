"use client";

import Link from "next/link";
import { useState } from "react";

import { ImageField } from "@/components/admin/ImageField";
import { Toggle } from "@/components/admin/Toggle";
import { Sheet, SheetBody, SheetFooter } from "@/components/Sheet";
import { Icon } from "@/components/Icon";
import type { AdminProduct, AdminStockItem } from "@/lib/admin-types";
import { parsePrice } from "@/lib/format";
import { parseQuantity } from "@/lib/stock";
import { useAdminAction } from "@/lib/use-admin-action";

function priceToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Fenêtre de création / modification d'un produit. */
export function ProductForm({
  venueId,
  product,
  categoryId,
  categories,
  stockItems,
  allProducts,
  pairings,
  onClose,
}: {
  venueId: string;
  product: AdminProduct | null;
  categoryId: string;
  categories: { id: string; name: string }[];
  stockItems: AdminStockItem[];
  /** Produits de la carte, pour « Suggérer avec ce produit » (null : base sans le script 10). */
  allProducts: { id: string; name: string }[] | null;
  /** Suggestions choisies pour ce produit */
  pairings: string[];
  onClose: () => void;
}) {
  const { run, error, setError } = useAdminAction();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? priceToInput(product.price_cents) : "");
  const [category, setCategory] = useState(product?.category_id ?? categoryId);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [available, setAvailable] = useState(product?.is_available ?? true);
  // Ce que consomme une unité vendue (quantités saisies en texte : « 0,25 »)
  const [recipe, setRecipe] = useState(
    (product?.recipe ?? []).map((line) => ({ stock_item_id: line.stock_item_id, quantity: String(Number(line.quantity)).replace(".", ",") })),
  );
  // « Souvent pris avec » choisi par le gérant (3 au plus)
  const [suggested, setSuggested] = useState<string[]>(pairings);
  const otherProducts = (allProducts ?? []).filter((p) => p.id !== product?.id);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const priceCents = parsePrice(price);
    if (priceCents === null) {
      setError("Prix invalide : écrivez par exemple 6,50 (maximum 1 000 €).");
      return;
    }
    const recipeLines = recipe.map((line) => ({ stock_item_id: line.stock_item_id, quantity: parseQuantity(line.quantity) }));
    if (recipeLines.some((line) => !line.quantity)) {
      setError("Stock : indiquez pour chaque article une quantité supérieure à 0 (par exemple 1 ou 0,25).");
      return;
    }
    setSaving(true);
    const result = await run("admin_save_product", {
      p_venue_id: venueId,
      p_product: {
        id: product?.id ?? null,
        category_id: category,
        name,
        description,
        price_cents: priceCents,
        image_url: imageUrl,
        is_available: available,
        recipe: recipeLines,
      },
    });
    if (result.ok && allProducts && suggested.join() !== pairings.join()) {
      const saved = await run("admin_set_product_pairings", {
        p_product_id: result.data,
        p_suggested: [...new Set(suggested)],
      });
      setSaving(false);
      if (saved.ok) onClose();
      return;
    }
    setSaving(false);
    if (result.ok) onClose();
  }

  return (
    <Sheet title={product ? "Modifier le produit" : "Nouveau produit"} eyebrow="La carte" onClose={onClose}>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <SheetBody>
          <div className="grid gap-4">
            <Field label="Nom">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className={inputClass} placeholder="Ex. : Mojito" />
            </Field>
            <Field label="Description (facultatif)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                rows={2}
                className={`${inputClass} resize-none`}
                placeholder="Ex. : Rhum, menthe fraîche, citron vert"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prix (€)">
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required className={inputClass} placeholder="6,50" />
              </Field>
              <Field label="Catégorie">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="field">
              <span>Photo (facultatif)</span>
              <ImageField venueId={venueId} folder="produits" value={imageUrl} onChange={setImageUrl} maxSize={800} format="image/jpeg" emptyLabel="Pas de photo" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-4 py-1.5">
              <span className="font-semibold">{available ? "Disponible" : "Épuisé (grisé sur la carte)"}</span>
              <Toggle checked={available} onChange={setAvailable} label="Disponible" />
            </div>

            <div className="field">
              <span>Stock (facultatif)</span>
              <p className="text-[13px] text-muted">
                Ce que consomme un « {name.trim() || "produit"} » vendu : le stock baisse à chaque commande, et le produit passe « Épuisé »
                tout seul quand il en manque.
              </p>
              {stockItems.length === 0 ? (
                <p className="rounded-md bg-sand-2 px-4 py-3 text-[14px] text-ink-2">
                  Aucun article de stock pour l&apos;instant :{" "}
                  <Link href="/stocks" className="font-semibold text-ink underline">
                    créez-les dans la page Stocks
                  </Link>
                  .
                </p>
              ) : (
                <div className="grid gap-2">
                  {recipe.map((line, index) => {
                    const item = stockItems.find((s) => s.id === line.stock_item_id);
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <select
                          value={line.stock_item_id}
                          aria-label="Article de stock"
                          onChange={(e) =>
                            setRecipe((current) => current.map((l, i) => (i === index ? { ...l, stock_item_id: e.target.value } : l)))
                          }
                          className="input min-w-0 flex-1"
                        >
                          {stockItems.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <input
                          inputMode="decimal"
                          value={line.quantity}
                          aria-label={`Quantité de ${item?.name ?? "l'article"} par ${name.trim() || "produit"} vendu`}
                          onChange={(e) =>
                            setRecipe((current) => current.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))
                          }
                          className="input !w-20 text-right tabular-nums"
                        />
                        <span className="w-16 shrink-0 text-[13px] text-ink-2">{item?.unit}</span>
                        <button
                          type="button"
                          aria-label={`Retirer ${item?.name ?? "cet article"}`}
                          onClick={() => setRecipe((current) => current.filter((_, i) => i !== index))}
                          className="icon-btn"
                        >
                          <Icon name="close" size={15} />
                        </button>
                      </div>
                    );
                  })}
                  {recipe.length < 10 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecipe((current) => [
                          ...current,
                          {
                            stock_item_id: (stockItems.find((s) => !current.some((l) => l.stock_item_id === s.id)) ?? stockItems[0]).id,
                            quantity: "1",
                          },
                        ])
                      }
                      className="btn btn--soft btn--sm justify-self-start"
                    >
                      <Icon name="plus" size={15} />
                      Ajouter un article de stock
                    </button>
                  )}
                </div>
              )}
            </div>

            {allProducts && otherProducts.length > 0 && (
              <div className="field">
                <span>Suggérer avec ce produit (facultatif)</span>
                <p className="text-[13px] text-muted">
                  Dans le panier du client, proposés en premier avec « {name.trim() || "ce produit"} ». Sinon, l&apos;application choisit
                  d&apos;après vos ventes.
                </p>
                <div className="grid gap-2">
                  {suggested.map((id, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={id}
                        aria-label={`Suggestion ${index + 1}`}
                        onChange={(e) => setSuggested((current) => current.map((s, i) => (i === index ? e.target.value : s)))}
                        className="input min-w-0 flex-1"
                      >
                        {otherProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Retirer la suggestion ${index + 1}`}
                        onClick={() => setSuggested((current) => current.filter((_, i) => i !== index))}
                        className="icon-btn"
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </div>
                  ))}
                  {suggested.length < 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSuggested((current) => [...current, (otherProducts.find((p) => !current.includes(p.id)) ?? otherProducts[0]).id])
                      }
                      className="btn btn--soft btn--sm justify-self-start"
                    >
                      <Icon name="sparkle" size={15} />
                      Ajouter une suggestion
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetBody>

        <SheetFooter>
          {error && (
            <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn--ghost flex-1">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="btn btn--primary flex-1">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </SheetFooter>
      </form>
    </Sheet>
  );
}

export const inputClass = "input";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
