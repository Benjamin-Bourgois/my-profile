// Messages affichés au gérant quand la base refuse une modification.

const MESSAGES: Record<string, string> = {
  ACCES_REFUSE: "Accès refusé : cette action est réservée au gérant du bar.",
  INTROUVABLE: "Élément introuvable : il a peut-être été supprimé. La page a été actualisée.",
  TABLE_INTROUVABLE: "Table introuvable : elle a peut-être été supprimée.",
  NOM_INVALIDE: "Le nom est obligatoire (40 caractères maximum, 80 pour un produit ou le bar).",
  CATEGORIE_NON_VIDE: "Cette catégorie contient encore des produits : supprimez-les ou déplacez-les d'abord.",
  CATEGORIE_INVALIDE: "Choisissez une catégorie.",
  PRIX_INVALIDE: "Prix invalide (entre 0 et 1 000 €).",
  DESCRIPTION_TROP_LONGUE: "La description est trop longue (300 caractères maximum).",
  IMAGE_INVALIDE: "Image invalide.",
};

export function adminErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const code = error?.message ?? "";
  if (code in MESSAGES) return MESSAGES[code];
  if (/jwt|token/i.test(`${error?.code} ${code}`)) return "Session expirée : reconnectez-vous.";
  if (/could not find the function/i.test(code)) {
    return "Base incomplète : exécutez le script supabase/4-etape-4.sql dans Supabase (SQL Editor).";
  }
  return "La modification n'a pas pu être enregistrée. Réessayez.";
}
