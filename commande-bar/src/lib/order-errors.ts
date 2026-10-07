// Messages affichés au client quand la base refuse une commande ou un appel
// (codes levés par les fonctions SQL create_order et create_table_call).

const MESSAGES: Record<string, { status: number; message: string }> = {
  CARTE_INVALIDE: { status: 404, message: "Carte non reconnue, demandez au serveur." },
  COMMANDES_EN_PAUSE: {
    status: 409,
    message: "Le bar ne prend plus de commandes pour le moment. Réessayez un peu plus tard ou appelez un serveur.",
  },
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
  STOCK_INSUFFISANT: {
    status: 409,
    message: "Il n'en reste plus assez en stock. La carte a été mise à jour, vérifiez votre panier.",
  },
  PANIER_VIDE: { status: 400, message: "Votre panier est vide." },
  PANIER_INVALIDE: { status: 400, message: "Votre panier contient une erreur. Retirez les articles puis ajoutez-les à nouveau." },
  PANIER_TROP_GROS: { status: 400, message: "Commande trop importante : 20 exemplaires par produit et 50 articles au maximum." },
  COMMENTAIRE_TROP_LONG: { status: 400, message: "Le commentaire est trop long (300 caractères maximum)." },
  MONTANT_TROP_FAIBLE: { status: 400, message: "Le paiement en ligne n'est possible qu'à partir de 0,50 €." },
  POURBOIRE_INVALIDE: { status: 400, message: "Le pourboire ne peut pas dépasser le montant de la commande." },
  TROP_D_APPELS: { status: 429, message: "Plusieurs appels viennent d'être envoyés. Un serveur va passer, merci de patienter." },
  BAR_SUSPENDU: {
    status: 403,
    message: "La commande à table n'est pas disponible dans cet établissement pour le moment. Adressez-vous au personnel.",
  },
};

export const GENERIC_ORDER_ERROR = "Petit souci technique, la commande n'est pas partie. Réessayez dans un instant.";

/** Codes après lesquels la carte affichée doit être rechargée. */
export const MENU_CHANGED_CODES = ["PRODUIT_INDISPONIBLE", "PRODUIT_INCONNU", "COMMANDES_EN_PAUSE", "STOCK_INSUFFISANT", "BAR_SUSPENDU"];

/** `detail` : pour un manque de stock, le nom des produits concernés. */
export function orderError(code: string, detail?: string | null): { status: number; message: string } {
  if (code === "STOCK_INSUFFISANT" && detail) {
    return {
      status: 409,
      message: `Il ne reste plus assez de « ${detail} ». La carte a été mise à jour, vérifiez votre panier.`,
    };
  }
  return MESSAGES[code] ?? { status: 500, message: GENERIC_ORDER_ERROR };
}

export function isKnownOrderError(code: string): boolean {
  return code in MESSAGES;
}
