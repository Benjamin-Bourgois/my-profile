"use client";

import { useOptimistic, useState } from "react";

import { inputClass, ProductForm } from "@/components/admin/ProductForm";
import { Toggle } from "@/components/admin/Toggle";
import { Icon } from "@/components/Icon";
import { menuReducer, type MenuAction } from "@/lib/admin-reducers";
import type { AdminCategory, AdminProduct, AdminStockItem } from "@/lib/admin-types";
import { formatPrice } from "@/lib/format";
import { productEmoji } from "@/lib/style";
import { useAdminAction } from "@/lib/use-admin-action";

type Editing = { product: AdminProduct | null; categoryId: string };

/** Gestion de la carte : catégories, produits, prix, photos, disponibilité. */
export function MenuManager({
  venueId,
  categories: serverCategories,
  stockItems,
  pairings,
}: {
  venueId: string;
  categories: AdminCategory[];
  stockItems: AdminStockItem[];
  /** Suggestions choisies par produit (null : base sans le script 10). */
  pairings: Record<string, string[]> | null;
}) {
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
          <h2 className="text-[30px]">La carte</h2>
          <p className="text-ink-2">Les changements apparaissent immédiatement sur les téléphones des clients.</p>
        </div>
        <SavingIndicator pending={pending} />
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {categories.map((category, index) => (
        <section key={category.id} className="card overflow-hidden !p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sand-2/60 px-4 py-3">
            {renaming?.id === category.id ? (
              <form onSubmit={renameCategory} className="flex flex-1 flex-wrap gap-2">
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: category.id, name: e.target.value })}
                  maxLength={40}
                  className="input min-w-40 flex-1"
                  aria-label="Nouveau nom de la catégorie"
                />
                <button type="submit" className="btn btn--primary btn--sm">
                  OK
                </button>
                <button type="button" onClick={() => setRenaming(null)} className="btn btn--ghost btn--sm">
                  Annuler
                </button>
              </form>
            ) : (
              <>
                <h3 className="flex-1 text-[24px]">{category.name}</h3>
                <IconButton label={`Monter ${category.name}`} disabled={index === 0} onClick={() => moveCategory(category.id, -1)}>
                  <Icon name="chevronUp" size={16} />
                </IconButton>
                <IconButton label={`Descendre ${category.name}`} disabled={index === categories.length - 1} onClick={() => moveCategory(category.id, 1)}>
                  <Icon name="chevronDown" size={16} />
                </IconButton>
                <SmallButton onClick={() => setRenaming({ id: category.id, name: category.name })}>Renommer</SmallButton>
                <SmallButton
                  danger
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

          <ul className="divide-y divide-line">
            {category.products.map((product, productIndex) => (
              <li key={product.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="h-14 w-14 shrink-0 rounded-[12px] bg-sand-2 object-cover" />
                ) : (
                  <div aria-hidden className="photo-placeholder h-14 w-14 shrink-0 rounded-[12px] !text-[24px]">
                    {productEmoji(product.name, category.name)}
                  </div>
                )}
                <div className={`min-w-40 flex-1 ${product.is_available ? "" : "opacity-55"}`}>
                  <p className="font-serif text-[20px] font-semibold leading-tight">{product.name}</p>
                  {product.description && <p className="line-clamp-1 text-[13px] text-ink-2">{product.description}</p>}
                  <StockBadge remaining={product.remaining} />
                </div>
                <span className="w-20 text-right font-bold tabular-nums">{formatPrice(product.price_cents)}</span>
                <span className="flex w-36 items-center gap-2">
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
                  <span className={`badge ${product.is_available ? "badge--ok" : "badge--danger"}`}>
                    {product.is_available ? "Disponible" : "Épuisé"}
                  </span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <IconButton label={`Monter ${product.name}`} disabled={productIndex === 0} onClick={() => moveProduct(product.id, -1)}>
                    <Icon name="chevronUp" size={16} />
                  </IconButton>
                  <IconButton
                    label={`Descendre ${product.name}`}
                    disabled={productIndex === category.products.length - 1}
                    onClick={() => moveProduct(product.id, 1)}
                  >
                    <Icon name="chevronDown" size={16} />
                  </IconButton>
                  <SmallButton onClick={() => setEditing({ product, categoryId: category.id })}>
                    <Icon name="pencil" size={15} />
                    Modifier
                  </SmallButton>
                  <SmallButton
                    danger
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
            {category.products.length === 0 && <li className="px-4 py-4 text-ink-2">Aucun produit dans cette catégorie.</li>}
          </ul>
          <div className="border-t border-line px-4 py-3">
            <button type="button" onClick={() => setEditing({ product: null, categoryId: category.id })} className="btn btn--soft btn--sm">
              <Icon name="plus" size={16} />
              Ajouter un produit
            </button>
          </div>
        </section>
      ))}

      <form onSubmit={addCategory} className="card flex flex-wrap items-end gap-3 !p-4">
        <label className="field min-w-56 flex-1">
          <span>Nouvelle catégorie</span>
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={40} placeholder="Ex. : Vins" className={inputClass} />
        </label>
        <button type="submit" disabled={adding || !newCategory.trim()} className="btn btn--primary">
          {adding ? "Ajout…" : "Ajouter la catégorie"}
        </button>
      </form>

      {editing && (
        <ProductForm
          venueId={venueId}
          product={editing.product}
          categoryId={editing.categoryId}
          categories={categories.map(({ id, name }) => ({ id, name }))}
          stockItems={stockItems}
          allProducts={pairings ? categories.flatMap((c) => c.products.map(({ id, name }) => ({ id, name }))) : null}
          pairings={(editing.product && pairings?.[editing.product.id]) || []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Petit indicateur discret pendant l'enregistrement en arrière-plan. */
export function SavingIndicator({ pending }: { pending: boolean }) {
  return (
    <span aria-live="polite" className={`badge ${pending ? "" : "badge--ok"}`}>
      {!pending && <Icon name="check" size={12} />}
      {pending ? "Enregistrement…" : "À jour"}
    </span>
  );
}

/** Message d'erreur qui reste visible en haut pendant le défilement. */
export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="sticky top-2 z-10 flex gap-2 rounded-md border border-danger-soft bg-danger-soft px-4 py-3 text-danger shadow-soft">
      <Icon name="alert" className="mt-0.5" />
      {children}
    </p>
  );
}

export function SmallButton({ children, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button type="button" {...props} className={`btn btn--sm ${danger ? "btn--danger" : "btn--ghost"}`}>
      {children}
    </button>
  );
}

export function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...props} className="icon-btn">
      {children}
    </button>
  );
}

/** Unités encore vendables d'après le stock (rien si le stock n'est pas suivi). */
function StockBadge({ remaining }: { remaining: number | null }) {
  if (remaining === null || remaining === undefined) return null;
  if (remaining <= 0) return <span className="badge badge--danger mt-1">Rupture de stock</span>;
  if (remaining <= 5) return <span className="badge badge--warn mt-1">Stock : {remaining}</span>;
  return <span className="mt-1 block text-[12px] text-muted">Stock : de quoi en servir {remaining}</span>;
}
