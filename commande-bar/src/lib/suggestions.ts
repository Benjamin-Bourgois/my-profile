// Suggestions aux clients : « Souvent pris avec » (panier) et « Une autre tournée ? » (suivi).

import { useLocalState } from "@/lib/local-store";
import type { MenuProduct } from "@/lib/menu";

/** Renvoyées par get_suggestions() : pour chaque produit, 3 produits au plus ; meilleures ventes. */
export type Suggestions = { enabled: boolean; pairs: Record<string, string[]>; popular: string[] };

export type SuggestionKind = "pairing" | "reorder";

/** « Une autre tournée ? » : produits de la commande encore à la carte (get_reorder_items). */
export type ReorderOffer = {
  served_at: string | null;
  items: { product_id: string; name: string; price_cents: number; quantity: number }[];
};

/** Délai après le service avant de proposer la même chose. */
export const REORDER_DELAY_MS = 15 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Origine des articles du panier (pour compter ce que l'appli rapporte) */
/* ------------------------------------------------------------------ */

export type Origins = Record<string, SuggestionKind>;

const NO_ORIGINS: Origins = {};

function validateOrigins(value: unknown): Origins {
  if (!value || typeof value !== "object" || Array.isArray(value)) return NO_ORIGINS;
  const origins: Origins = {};
  for (const [id, kind] of Object.entries(value)) {
    if (kind === "pairing" || kind === "reorder") origins[id] = kind;
  }
  return origins;
}

/** Produits du panier ajoutés grâce à une suggestion (gardé dans le téléphone, avec le panier). */
export function useOrigins(token: string) {
  return useLocalState(`origines:${token}`, NO_ORIGINS, validateOrigins);
}

/* ------------------------------------------------------------------ */
/* Choix des suggestions pour un panier                                */
/* ------------------------------------------------------------------ */

/**
 * Jusqu'à `max` produits à proposer avec le panier : d'abord ce qui se prend avec
 * ses produits (choix du gérant, puis ventes), sinon les meilleures ventes
 * d'une autre catégorie que celles du panier. Jamais un produit épuisé ou déjà pris.
 */
export function pickSuggestions(
  cartIds: string[],
  suggestions: Suggestions | null,
  products: Map<string, MenuProduct>,
  categoryOf: Map<string, string>,
  max = 2,
): MenuProduct[] {
  if (!suggestions?.enabled || cartIds.length === 0) return [];
  const inCart = new Set(cartIds);
  const usable = (id: string) => {
    const product = products.get(id);
    return !!product && !inCart.has(id) && product.is_available && product.price_cents > 0 && product.remaining !== 0;
  };

  const scores = new Map<string, number>();
  for (const id of cartIds) {
    (suggestions.pairs[id] ?? []).forEach((other, rank) => scores.set(other, (scores.get(other) ?? 0) + 3 - rank));
  }
  const paired = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const cartCategories = new Set(cartIds.map((id) => categoryOf.get(id)));
  const elsewhere = suggestions.popular.filter((id) => !cartCategories.has(categoryOf.get(id)));

  const picked: MenuProduct[] = [];
  for (const id of new Set([...paired, ...elsewhere])) {
    if (picked.length >= max) break;
    if (usable(id)) picked.push(products.get(id) as MenuProduct);
  }
  return picked;
}
