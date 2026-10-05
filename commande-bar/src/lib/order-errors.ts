// Messages affichés au client quand la base refuse une commande
// (codes levés par la fonction SQL create_order).

const MESSAGES: Record<string, { status: number; message: string }> = {
  CARTE_INVALIDE: { status: 404, message: "Carte non reconnue, demandez au serveur." },
  PAIEMENT_INDISPONIBLE: { status: 400, message: "Ce mode de paiement n'est pas disponible." },
  TROP_DE_COMMANDES: {
    status: 429,
    message: "Plusieurs commandes viennent d'être envoyées depuis cette table. Patientez 2 minutes avant de recommander.",
  },
  PRODUIT_INDISPONIBLE: {
    status: 409,
    message: "Un produit de votre panier vient d'être épuisé. La carte a été mise à jour, vérifiez votre panier.",
  },
  PRODUIT_INCONNU: { status: 409, message: "La carte a changé. Vérifiez votre panier." },
  PANIER_VIDE: { status: 400, message: "Votre panier est vide." },
  PANIER_INVALIDE: { status: 400, message: "Votre panier contient une erreur. Retirez les articles puis ajoutez-les à nouveau." },
  PANIER_TROP_GROS: { status: 400, message: "Commande trop importante : 20 exemplaires par produit et 50 articles au maximum." },
  COMMENTAIRE_TROP_LONG: { status: 400, message: "Le commentaire est trop long (300 caractères maximum)." },
  MONTANT_TROP_FAIBLE: { status: 400, message: "Le paiement en ligne n'est possible qu'à partir de 0,50 €." },
};

export const GENERIC_ORDER_ERROR = "Petit souci technique, la commande n'est pas partie. Réessayez dans un instant.";

/** Codes après lesquels la carte affichée doit être rechargée. */
export const MENU_CHANGED_CODES = ["PRODUIT_INDISPONIBLE", "PRODUIT_INCONNU"];

export function orderError(code: string): { status: number; message: string } {
  return MESSAGES[code] ?? { status: 500, message: GENERIC_ORDER_ERROR };
}

export function isKnownOrderError(code: string): boolean {
  return code in MESSAGES;
}
