// Lecture des bons de livraison par l'IA : types, limites et messages
// (partagés entre le serveur et le navigateur).

/** 4 photos par bon (ou un PDF), 4 Mo en tout : sous la limite d'envoi de Vercel. */
export const SCAN_MAX_FILES = 4;
export const SCAN_MAX_PAGES = 10;
export const SCAN_MAX_BYTES = 4 * 1024 * 1024;
/** Taille des photos après réduction dans le navigateur (bord le plus long, en pixels). */
export const SCAN_PHOTO_SIZE = 2000;

/**
 * Tarif du modèle utilisé (claude-opus-5-5, voir delivery-scan-ai.ts), en dollars par
 * million de jetons : sert à estimer le coût des lectures dans l'espace agence.
 */
export const SCAN_PRICE_PER_MILLION = { input: 4, output: 20 } as const;

/** Coût estimé en dollars d'après les jetons envoyés et produits. */
export function scanCostDollars(inputTokens: number, outputTokens: number): number {
  return (inputTokens * SCAN_PRICE_PER_MILLION.input + outputTokens * SCAN_PRICE_PER_MILLION.output) / 1_000_000;
}

export type ScanLine = {
  /** Texte tel qu'il est écrit sur le bon */
  label: string;
  /** Quantité telle qu'elle est écrite (« 6 x 70 cl ») */
  quantity_text: string;
  /** Article de stock proposé (null : pas trouvé) */
  stock_item_id: string | null;
  /** Quantité à ajouter, dans l'unité de l'article */
  quantity: number | null;
  /** Calcul en une phrase (« 6 bouteilles × 70 cl = 420 cl ») */
  explanation: string;
  /** « low » : à vérifier de près */
  confidence: "high" | "low";
};

export type ScanResult = {
  scan_id: string;
  supplier: string | null;
  reference: string | null;
  document_date: string | null;
  warning: string | null;
  lines: ScanLine[];
};

export const SCAN_ERRORS = {
  SCAN_NON_CONFIGURE: "La lecture des bons n'est pas encore activée sur ce site.",
  FICHIERS_INVALIDES: `Ajoutez 1 à ${SCAN_MAX_FILES} photos du bon de livraison (ou un PDF).`,
  FORMAT_NON_SUPPORTE: "Format non reconnu : envoyez une photo (JPEG, PNG, WebP) ou un PDF.",
  TROP_LOURD: "Fichiers trop lourds (4 Mo en tout). Pour un PDF, gardez seulement les pages utiles.",
  TROP_DE_PAGES: `${SCAN_MAX_PAGES} pages au maximum par lecture.`,
  ACCES_REFUSE: "Accès refusé : reconnectez-vous.",
  AUCUN_ARTICLE: "Créez d'abord vos articles de stock : l'IA a besoin de la liste pour retrouver les produits.",
  TROP_DE_LECTURES: "Trop de lectures en peu de temps : réessayez dans quelques minutes (40 lectures par jour au maximum).",
  PAS_UN_BON: "Ce document ne ressemble pas à un bon de livraison ni à une facture. Reprenez la photo.",
  AUCUNE_LIGNE: "Aucun produit livré n'a été trouvé sur ce document. Reprenez la photo, bien à plat et bien éclairée.",
  IA_CLE_REFUSEE: "La clé ANTHROPIC_API_KEY est refusée par Anthropic : vérifiez-la dans Vercel.",
  IA_REFUS: "Le service d'IA a refusé la demande : vérifiez le crédit du compte Anthropic, ou réessayez avec une photo plus nette.",
  ILLISIBLE: "L'IA n'a pas pu lire ce document : reprenez la photo du bon seul, bien nette.",
  IA_OCCUPEE: "Le service d'IA est très sollicité : réessayez dans une minute.",
  IA_TROP_LONG: "La lecture a pris trop de temps : réessayez avec moins de pages.",
  IA_INDISPONIBLE: "La lecture n'a pas abouti : réessayez dans un instant.",
  BASE_INCOMPLETE: "Base incomplète : exécutez le script supabase/8-bons-de-livraison.sql dans Supabase (SQL Editor).",
  ERREUR: "La lecture n'a pas abouti. Réessayez.",
} as const;

export type ScanErrorCode = keyof typeof SCAN_ERRORS;

/** Messages de la base à l'enregistrement de la livraison. */
export const APPLY_ERRORS: Record<string, string> = {
  DEJA_ENREGISTRE: "Cette livraison a déjà été enregistrée.",
  LECTURE_INVALIDE: "Cette lecture n'est plus valable : relancez la lecture du bon.",
  LIVRAISON_VIDE: "Choisissez au moins un article à ajouter au stock.",
  LIVRAISON_INVALIDE: "Une ligne est invalide : choisissez un article et une quantité supérieure à 0.",
  INTROUVABLE: "Lecture introuvable : relancez la lecture du bon.",
};

/** « 📸 Bon de livraison · DistriBoissons · n° F-123 » (note de l'historique, 200 caractères maximum) */
export function deliveryNote(result: Pick<ScanResult, "supplier" | "reference">): string {
  const parts = ["📸 Bon de livraison", result.supplier, result.reference && `n° ${result.reference}`].filter(Boolean);
  return parts.join(" · ").slice(0, 200);
}
