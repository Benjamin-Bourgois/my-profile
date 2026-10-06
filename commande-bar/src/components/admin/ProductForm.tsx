"use client";

import { useEffect, useState } from "react";

import { ImageField } from "@/components/admin/ImageField";
import { Toggle } from "@/components/admin/Toggle";
import type { AdminProduct } from "@/lib/admin-types";
import { parsePrice } from "@/lib/format";
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
  onClose,
}: {
  venueId: string;
  product: AdminProduct | null;
  categoryId: string;
  categories: { id: string; name: string }[];
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const priceCents = parsePrice(price);
    if (priceCents === null) {
      setError("Prix invalide : écrivez par exemple 6,50 (maximum 1 000 €).");
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
      },
    });
    setSaving(false);
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-stone-900/50 sm:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="produit-titre"
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
      >
        <h2 id="produit-titre" className="text-xl font-bold">
          {product ? "Modifier le produit" : "Nouveau produit"}
        </h2>

        <div className="mt-5 space-y-4">
          <Field label="Nom">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className={inputClass} placeholder="Ex. : Mojito" />
          </Field>
          <Field label="Description (facultatif)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} className={inputClass} placeholder="Ex. : Rhum, menthe fraîche, citron vert" />
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
          <div>
            <span className="text-sm font-semibold text-stone-700">Photo (facultatif)</span>
            <div className="mt-1">
              <ImageField venueId={venueId} folder="produits" value={imageUrl} onChange={setImageUrl} maxSize={800} format="image/jpeg" emptyLabel="Pas de photo" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-stone-100 px-4 py-3">
            <span className="font-semibold">{available ? "Disponible" : "Indisponible (grisé sur la carte)"}</span>
            <Toggle checked={available} onChange={setAvailable} label="Disponible" />
          </div>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl bg-stone-200 font-semibold">
            Annuler
          </button>
          <button type="submit" disabled={saving} className="h-12 flex-1 rounded-xl bg-stone-900 font-bold text-white disabled:opacity-50">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}

export const inputClass =
  "mt-1 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base focus:border-stone-900 focus:outline-none";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-stone-700">{label}</span>
      {children}
    </label>
  );
}
