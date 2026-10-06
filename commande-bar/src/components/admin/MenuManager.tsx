"use client";

import { useOptimistic, useState } from "react";

import { inputClass, ProductForm } from "@/components/admin/ProductForm";
import { Toggle } from "@/components/admin/Toggle";
import { menuReducer, type MenuAction } from "@/lib/admin-reducers";
import type { AdminCategory, AdminProduct } from "@/lib/admin-types";
import { formatPrice } from "@/lib/format";
import { useAdminAction } from "@/lib/use-admin-action";

type Editing = { product: AdminProduct | null; categoryId: string };

/** Gestion de la carte : catégories, produits, prix, photos, disponibilité. */
export function MenuManager({ venueId, categories: serverCategories }: { venueId: string; categories: AdminCategory[] }) {
  const { run, pending, error } = useAdminAction();
  // Carte affichée = carte du serveur + changements en cours d'enregistrement
  const [categories, applyOptimistic] = useOptimistic(serverCategories, menuReducer);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [adding, setAdding] = useState(false);

  /** Modification avec mise à jour immédiate de l'écran. */
  const act = (fn: string, args: Record<string, unknown>, action: MenuAction) => run(fn, args, () => applyOptimistic(action));

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    const result = await run("admin_save_category", { p_venue_id: venueId, p_category_id: null, p_name: newCategory });
    setAdding(false);
    if (result.ok) setNewCategory("");
  }

  function renameCategory(event: React.FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    act("admin_save_category", { p_venue_id: venueId, p_category_id: renaming.id, p_name: renaming.name }, {
      type: "rename-category",
      categoryId: renaming.id,
      name: renaming.name,
    });
    setRenaming(null);
  }

  const moveCategory = (id: string, direction: -1 | 1) =>
    act("admin_move", { p_kind: "category", p_id: id, p_direction: direction }, { type: "move-category", categoryId: id, direction });
  const moveProduct = (id: string, direction: -1 | 1) =>
    act("admin_move", { p_kind: "product", p_id: id, p_direction: direction }, { type: "move-product", productId: id, direction });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">La carte</h2>
          <p className="text-stone-600">Les changements apparaissent immédiatement sur les téléphones des clients.</p>
        </div>
        <SavingIndicator pending={pending} />
      </div>

      {error && (
        <p role="alert" className="sticky top-2 z-10 rounded-xl bg-red-100 px-4 py-3 text-red-900 shadow">
          {error}
        </p>
      )}

      {categories.map((category, index) => (
        <section key={category.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
            {renaming?.id === category.id ? (
              <form onSubmit={renameCategory} className="flex flex-1 gap-2">
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: category.id, name: e.target.value })}
                  maxLength={40}
                  className="h-11 flex-1 rounded-xl border border-stone-300 px-3"
                  aria-label="Nouveau nom de la catégorie"
                />
                <button type="submit" className="h-11 rounded-xl bg-stone-900 px-4 font-semibold text-white">
                  OK
                </button>
                <button type="button" onClick={() => setRenaming(null)} className="h-11 rounded-xl px-3 font-semibold text-stone-600">
                  Annuler
                </button>
              </form>
            ) : (
              <>
                <h3 className="flex-1 text-xl font-bold">{category.name}</h3>
                <IconButton label={`Monter ${category.name}`} disabled={index === 0} onClick={() => moveCategory(category.id, -1)}>
                  ↑
                </IconButton>
                <IconButton label={`Descendre ${category.name}`} disabled={index === categories.length - 1} onClick={() => moveCategory(category.id, 1)}>
                  ↓
                </IconButton>
                <SmallButton onClick={() => setRenaming({ id: category.id, name: category.name })}>Renommer</SmallButton>
                <SmallButton
                  disabled={category.products.length > 0}
                  title={category.products.length > 0 ? "Videz d'abord la catégorie" : undefined}
                  onClick={() => {
                    if (window.confirm(`Supprimer la catégorie « ${category.name} » ?`)) {
                      act("admin_delete_category", { p_category_id: category.id }, { type: "delete-category", categoryId: category.id });
                    }
                  }}
                >
                  Supprimer
                </SmallButton>
              </>
            )}
          </div>

          <ul className="divide-y divide-stone-200">
            {category.products.map((product, productIndex) => (
              <li key={product.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-stone-100 object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-stone-100" aria-hidden />
                )}
                <div className={`min-w-40 flex-1 ${product.is_available ? "" : "opacity-50"}`}>
                  <p className="font-semibold">{product.name}</p>
                  {product.description && <p className="line-clamp-1 text-sm text-stone-500">{product.description}</p>}
                </div>
                <span className="w-20 text-right font-bold tabular-nums">{formatPrice(product.price_cents)}</span>
                <label className="flex items-center gap-2 text-sm font-semibold text-stone-600">
                  <Toggle
                    checked={product.is_available}
                    label={`${product.name} disponible`}
                    onChange={(available) =>
                      act(
                        "admin_set_product_available",
                        { p_product_id: product.id, p_available: available },
                        { type: "available", productId: product.id, value: available },
                      )
                    }
                  />
                  <span className="w-20">{product.is_available ? "Disponible" : "Épuisé"}</span>
                </label>
                <div className="flex gap-1">
                  <IconButton label={`Monter ${product.name}`} disabled={productIndex === 0} onClick={() => moveProduct(product.id, -1)}>
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Descendre ${product.name}`}
                    disabled={productIndex === category.products.length - 1}
                    onClick={() => moveProduct(product.id, 1)}
                  >
                    ↓
                  </IconButton>
                  <SmallButton onClick={() => setEditing({ product, categoryId: category.id })}>Modifier</SmallButton>
                  <SmallButton
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${product.name} » de la carte ?`)) {
                        act("admin_delete_product", { p_product_id: product.id }, { type: "delete-product", productId: product.id });
                      }
                    }}
                  >
                    Supprimer
                  </SmallButton>
                </div>
              </li>
            ))}
            {category.products.length === 0 && <li className="px-4 py-4 text-stone-500">Aucun produit dans cette catégorie.</li>}
          </ul>
          <div className="border-t border-stone-200 px-4 py-3">
            <button
              type="button"
              onClick={() => setEditing({ product: null, categoryId: category.id })}
              className="h-11 rounded-xl bg-amber-400 px-4 font-bold text-stone-900 hover:bg-amber-500"
            >
              + Ajouter un produit
            </button>
          </div>
        </section>
      ))}

      <form onSubmit={addCategory} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <label className="min-w-56 flex-1">
          <span className="text-sm font-semibold text-stone-700">Nouvelle catégorie</span>
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={40} placeholder="Ex. : Vins" className={inputClass} />
        </label>
        <button type="submit" disabled={adding || !newCategory.trim()} className="h-12 rounded-xl bg-stone-900 px-5 font-bold text-white disabled:opacity-50">
          {adding ? "Ajout…" : "Ajouter la catégorie"}
        </button>
      </form>

      {editing && (
        <ProductForm
          venueId={venueId}
          product={editing.product}
          categoryId={editing.categoryId}
          categories={categories.map(({ id, name }) => ({ id, name }))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Petit indicateur discret pendant l'enregistrement en arrière-plan. */
export function SavingIndicator({ pending }: { pending: boolean }) {
  return (
    <span aria-live="polite" className={`text-sm font-semibold ${pending ? "text-stone-500" : "text-green-700"}`}>
      {pending ? "Enregistrement…" : "✓ À jour"}
    </span>
  );
}

export function SmallButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-10 rounded-xl bg-stone-200 px-3 text-sm font-semibold text-stone-800 hover:bg-stone-300 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className="grid h-10 w-10 place-items-center rounded-xl bg-stone-200 text-lg font-bold text-stone-800 hover:bg-stone-300 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
