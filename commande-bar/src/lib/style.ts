import type { CSSProperties } from "react";

/** Décalage d'apparition d'un élément de liste (classe .rise). */
export function riseStyle(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

/** « Table 12 » → { label: "Table", value: "12" } pour le badge de table ; sinon le nom entier. */
export function splitTableLabel(label: string): { label: string; value: string } {
  const match = label.match(/^(table)\s+(.{1,6})$/i);
  return match ? { label: match[1], value: match[2] } : { label: "", value: label };
}

/** Emoji affiché quand un produit n'a pas de photo (d'après son nom, puis sa catégorie). */
const PRODUCT_EMOJIS: [RegExp, string][] = [
  [/virgin|sans alcool/i, "🍹"],
  [/cocktail|mojito|spritz|\bgin\b|martini|margarita|daiquiri|rhum|vodka|whisky|ap[ée]rol|pastis/i, "🍸"],
  [/bi[eè]res?|pinte|\bdemi\b|blonde|blanche|\bipa\b|ambr[ée]e|pression|stout|lager/i, "🍺"],
  [/\bvins?\b|bordeaux|bourgogne|ros[ée]\b|rouge|champagne|cr[ée]mant|prosecco/i, "🍷"],
  [/caf[ée]|espresso|cappuccino|\bth[ée]\b|infusion|chocolat chaud/i, "☕"],
  [/cola|limonade|soda|\bjus\b|sirop|\beau\b|tonic|orangina|softs?\b/i, "🥤"],
  [/charcuterie|saucisson|jambon/i, "🥓"],
  [/fromages?|comt[ée]|planche/i, "🧀"],
  [/olives?/i, "🫒"],
  [/frites|chips/i, "🍟"],
  [/cacahu[eè]tes?|noix|amandes|pistaches/i, "🥜"],
  [/sandwich|croque|burger/i, "🥪"],
  [/dessert|g[aâ]teau|tarte|glace|cr[eê]pe/i, "🍰"],
];

export function productEmoji(name: string, category: string): string {
  for (const text of [name, category]) {
    const match = PRODUCT_EMOJIS.find(([pattern]) => pattern.test(text));
    if (match) return match[1];
  }
  return "🍽️";
}
