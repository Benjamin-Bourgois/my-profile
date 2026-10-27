import { setTimeout as pause } from "node:timers/promises";

import Anthropic from "@anthropic-ai/sdk";

import { config, ErreurConfig, lireOffre } from "./config.ts";
import {
  ajouterDesinscrit,
  chargerSuivi,
  envoyesAujourdhui,
  importerProspects,
  joursDepuis,
  messageEnvoye,
  NOM_ETAPE,
  normaliserEmail,
  sauverSuivi,
  type Etape,
  type Prospect,
  type Suivi,
} from "./donnees.ts";
import { envoyer, testerGmail, texteComplet, verifierReponses } from "./gmail.ts";
import { ecrireBrouillon, fichierBrouillon, lireBrouillon, redigerMessage, supprimerBrouillon, testerClaude } from "./redaction.ts";

const enAttente = (prospect: Prospect) => prospect.messages.filter((message) => message.statut !== "envoye");

/** L'étape à rédiger maintenant pour ce prospect, ou null s'il n'y a rien à faire. */
function prochaineEtape(prospect: Prospect, maintenant = new Date()): Etape | null {
  if (prospect.statut !== "actif" || enAttente(prospect).length > 0) return null;
  const initial = messageEnvoye(prospect, "initial");
  if (!initial) return "initial";
  const { relance1Jours, relance2Jours } = config();
  const jours = joursDepuis(initial.envoyeLe!, maintenant);
  if (!messageEnvoye(prospect, "relance1")) return jours >= relance1Jours ? "relance1" : null;
  if (!messageEnvoye(prospect, "relance2")) return jours >= relance2Jours ? "relance2" : null;
  return null;
}

async function verifier(suivi: Suivi) {
  console.log("Lecture des réponses dans Gmail…");
  const bilan = await verifierReponses(suivi);
  sauverSuivi(suivi);
  for (const email of bilan.reponses) console.log(`  ✉ Réponse de ${email} : relances arrêtées, à toi de jouer.`);
  for (const email of bilan.desinscriptions) console.log(`  ⛔ ${email} ne veut plus être contacté : ajouté aux désinscrits.`);
  for (const email of bilan.erreurs) console.log(`  ⚠ ${email} : adresse refusée, prospect mis de côté.`);
  if (!bilan.reponses.length && !bilan.desinscriptions.length && !bilan.erreurs.length) console.log("  Rien de nouveau.");
}

async function rediger(suivi: Suivi) {
  const cfg = config();
  lireOffre();
  const { ajoutes, ignores } = importerProspects(suivi);
  sauverSuivi(suivi);
  if (ajoutes) console.log(`${ajoutes} nouveau(x) prospect(s) importé(s) depuis prospects.csv.`);
  for (const raison of ignores) console.log(`  Ignoré, ${raison}`);

  const prospects = Object.values(suivi.prospects);
  const dejaPrets = prospects.reduce((total, prospect) => total + enAttente(prospect).length, 0);
  const place = Math.max(0, cfg.limiteParJour - dejaPrets);
  // Les relances d'abord : elles arrivent au bon moment, les nouveaux prospects peuvent attendre.
  const aFaire = prospects
    .flatMap((prospect) => {
      const etape = prochaineEtape(prospect);
      return etape ? [{ prospect, etape }] : [];
    })
    .sort((a, b) => Number(a.etape === "initial") - Number(b.etape === "initial"));

  if (aFaire.length === 0) {
    console.log("Aucun email à rédiger pour le moment.");
    return;
  }
  if (place === 0) {
    console.log(`${dejaPrets} email(s) déjà prêt(s) ou à valider (limite : ${cfg.limiteParJour} par jour). Rien de plus à rédiger.`);
    return;
  }

  const lot = aFaire.slice(0, place);
  console.log(`Rédaction de ${lot.length} email(s) avec Claude…`);
  let reussis = 0;
  for (const { prospect, etape } of lot) {
    try {
      const message = await redigerMessage(prospect, etape);
      if (cfg.validationManuelle) ecrireBrouillon(prospect, message);
      else message.statut = "valide";
      prospect.messages.push(message);
      sauverSuivi(suivi);
      reussis++;
      console.log(`  ✓ ${prospect.email} · ${NOM_ETAPE[etape]} · « ${message.sujet} »`);
    } catch (erreur) {
      if (erreur instanceof Anthropic.AuthenticationError || erreur instanceof Anthropic.PermissionDeniedError) throw erreur;
      console.log(`  ✗ ${prospect.email} : ${erreur instanceof Error ? erreur.message : erreur}`);
    }
  }
  if (aFaire.length > lot.length) console.log(`${aFaire.length - lot.length} autre(s) seront rédigé(s) les jours suivants.`);
  if (cfg.validationManuelle && reussis) {
    console.log("\nÀ relire dans le dossier donnees/brouillons/ (ou avec « npm run apercu »), puis « npm run valider ».");
  }
}

function brouillons(suivi: Suivi, filtre: string[]) {
  const emails = new Set(filtre.map(normaliserEmail));
  return Object.values(suivi.prospects).flatMap((prospect) =>
    prospect.messages
      .filter((message) => message.statut === "brouillon" && (emails.size === 0 || emails.has(prospect.email)))
      .map((message) => ({ prospect, message })),
  );
}

function apercu(suivi: Suivi) {
  const liste = brouillons(suivi, []);
  if (liste.length === 0) return console.log("Aucun brouillon à relire.");
  for (const { prospect, message } of liste) {
    const contenu = lireBrouillon(prospect, message.etape) ?? message;
    console.log(`\n━━━ ${prospect.email} · ${NOM_ETAPE[message.etape]} ━━━`);
    console.log(`Fichier : ${fichierBrouillon(prospect, message.etape)}`);
    console.log(`Objet : ${contenu.sujet}\n`);
    console.log(texteComplet({ ...message, ...contenu }));
  }
  console.log(`\n${liste.length} brouillon(s). « npm run valider » pour tout valider, ou « npm run valider -- adresse@exemple.fr » pour un seul.`);
}

function valider(suivi: Suivi, emails: string[]) {
  const liste = brouillons(suivi, emails);
  if (liste.length === 0) return console.log("Aucun brouillon à valider.");
  let valides = 0;
  for (const { prospect, message } of liste) {
    try {
      const contenu = lireBrouillon(prospect, message.etape);
      if (!contenu) {
        console.log(`  ? ${prospect.email} : fichier du brouillon supprimé. Utilise « npm run rejeter -- ${prospect.email} » pour le faire réécrire.`);
        continue;
      }
      Object.assign(message, contenu, { statut: "valide" });
      supprimerBrouillon(prospect, message.etape);
      valides++;
      console.log(`  ✓ ${prospect.email} · ${NOM_ETAPE[message.etape]}`);
    } catch (erreur) {
      console.log(`  ✗ ${erreur instanceof Error ? erreur.message : erreur}`);
    }
  }
  sauverSuivi(suivi);
  console.log(`${valides} email(s) validé(s). Ils partiront avec « npm run envoyer » (ou « npm run cycle »).`);
}

function rejeter(suivi: Suivi, emails: string[]) {
  if (emails.length === 0) return console.log("Indique l'adresse : npm run rejeter -- adresse@exemple.fr");
  for (const email of emails.map(normaliserEmail)) {
    const prospect = suivi.prospects[email];
    if (!prospect) {
      console.log(`  ? ${email} : prospect inconnu.`);
      continue;
    }
    for (const message of enAttente(prospect)) supprimerBrouillon(prospect, message.etape);
    prospect.messages = prospect.messages.filter((message) => message.statut === "envoye");
    console.log(`  ✓ ${email} : brouillon supprimé, il sera réécrit au prochain « npm run rediger ».`);
  }
  sauverSuivi(suivi);
}

function exclure(suivi: Suivi, emails: string[]) {
  if (emails.length === 0) return console.log("Indique l'adresse : npm run exclure -- adresse@exemple.fr");
  for (const email of emails.map(normaliserEmail)) {
    ajouterDesinscrit(email);
    const prospect = suivi.prospects[email];
    if (prospect) {
      for (const message of enAttente(prospect)) supprimerBrouillon(prospect, message.etape);
      prospect.messages = prospect.messages.filter((message) => message.statut === "envoye");
      prospect.statut = "desinscrit";
      prospect.detailStatut = "Exclu à la main";
    }
    console.log(`  ✓ ${email} ne sera plus jamais contacté.`);
  }
  sauverSuivi(suivi);
}

async function envoyerValides(suivi: Suivi) {
  const cfg = config();
  const reste = cfg.limiteParJour - envoyesAujourdhui(suivi);
  const file = Object.values(suivi.prospects)
    .flatMap((prospect) =>
      prospect.messages.filter((message) => message.statut === "valide").map((message) => ({ prospect, message })),
    )
    .sort((a, b) => Number(a.message.etape === "initial") - Number(b.message.etape === "initial"));

  if (file.length === 0) return console.log("Aucun email validé en attente d'envoi.");
  if (reste <= 0) return console.log(`Limite du jour atteinte (${cfg.limiteParJour} emails). La suite partira demain.`);

  const lot = file.slice(0, reste);
  console.log(`Envoi de ${lot.length} email(s), avec une pause de ${cfg.delaiMinSecondes} à ${cfg.delaiMaxSecondes} s entre chaque. Laisse la fenêtre ouverte.`);
  let envoyes = 0;
  for (const [index, { prospect, message }] of lot.entries()) {
    // Une réponse ou une désinscription a pu arriver depuis la validation.
    if (prospect.statut !== "actif") continue;
    try {
      message.messageId = await envoyer(prospect, message);
      message.statut = "envoye";
      message.envoyeLe = new Date().toISOString();
      sauverSuivi(suivi);
      envoyes++;
      console.log(`  ✓ ${new Date().toLocaleTimeString("fr-FR")} · ${prospect.email} · ${NOM_ETAPE[message.etape]}`);
    } catch (erreur) {
      if ((erreur as { code?: string }).code === "EAUTH") throw erreur;
      console.log(`  ✗ ${prospect.email} : ${erreur instanceof Error ? erreur.message : erreur}`);
    }
    if (index < lot.length - 1) {
      const secondes = cfg.delaiMinSecondes + Math.random() * (cfg.delaiMaxSecondes - cfg.delaiMinSecondes);
      await pause(secondes * 1000);
    }
  }
  console.log(`${envoyes} email(s) envoyé(s).`);
  if (file.length > lot.length) console.log(`${file.length - lot.length} autre(s) partiront demain (limite de ${cfg.limiteParJour} par jour).`);
}

function afficherSuivi(suivi: Suivi) {
  const prospects = Object.values(suivi.prospects);
  if (prospects.length === 0) return console.log("Aucun prospect suivi pour l'instant. Lance « npm run rediger ».");
  const compte = (statut: Prospect["statut"]) => prospects.filter((prospect) => prospect.statut === statut).length;
  const contactes = prospects.filter((prospect) => messageEnvoye(prospect, "initial")).length;
  const repondus = compte("repondu");
  console.log(`Prospects : ${prospects.length} · contactés : ${contactes} · réponses : ${repondus}${contactes ? ` (${Math.round((100 * repondus) / contactes)} %)` : ""} · désinscrits : ${compte("desinscrit")} · adresses en erreur : ${compte("erreur")}`);
  console.log(`Envoyés aujourd'hui : ${envoyesAujourdhui(suivi)} / ${config().limiteParJour}\n`);
  const libelle: Record<Prospect["statut"], string> = { actif: "en cours", repondu: "A RÉPONDU", desinscrit: "désinscrit", erreur: "erreur" };
  for (const prospect of prospects) {
    const envoyes = prospect.messages.filter((message) => message.statut === "envoye");
    const dernier = envoyes.at(-1);
    const attente = enAttente(prospect)[0];
    const etat = attente
      ? `${NOM_ETAPE[attente.etape]} ${attente.statut === "brouillon" ? "à valider" : "prêt à partir"}`
      : dernier
        ? `${NOM_ETAPE[dernier.etape]} envoyé le ${new Date(dernier.envoyeLe!).toLocaleDateString("fr-FR")}`
        : "pas encore contacté";
    console.log(`${libelle[prospect.statut].padEnd(10)} ${prospect.email.padEnd(36)} ${etat}${prospect.detailStatut ? `\n           ${prospect.detailStatut}` : ""}`);
  }
}

async function testerConnexion() {
  const cfg = config();
  console.log(`Configuration lue : ${cfg.gmailAdresse}, ${cfg.limiteParJour} emails par jour, validation ${cfg.validationManuelle ? "manuelle" : "automatique"}.`);
  lireOffre();
  console.log("✓ offre.md");
  await testerGmail();
  console.log("✓ Gmail (envoi et lecture)");
  await testerClaude();
  console.log("✓ Claude");
}

const AIDE = `Agent de prospection : commandes disponibles

  npm run cycle            Tout en un : lit les réponses, envoie les emails validés, rédige les suivants
  npm run verifier         Lit les réponses dans Gmail (réponses, STOP, adresses invalides)
  npm run rediger          Importe prospects.csv et fait rédiger les emails par Claude
  npm run apercu           Affiche les brouillons à relire
  npm run valider          Valide tous les brouillons (ou : npm run valider -- adresse@exemple.fr)
  npm run rejeter -- <adresse>   Supprime un brouillon, qui sera réécrit
  npm run exclure -- <adresse>   Ne plus jamais contacter cette adresse
  npm run envoyer          Envoie les emails validés (dans la limite du jour)
  npm run suivi            Tableau de bord
  npm run test-connexion   Vérifie Gmail, Claude et la configuration`;

async function main() {
  const [commande, ...args] = process.argv.slice(2);
  const suivi = chargerSuivi();
  switch (commande) {
    case "verifier":
      return verifier(suivi);
    case "rediger":
      return rediger(suivi);
    case "apercu":
      return apercu(suivi);
    case "valider":
      return valider(suivi, args);
    case "rejeter":
      return rejeter(suivi, args);
    case "exclure":
      return exclure(suivi, args);
    case "envoyer":
      await verifier(suivi);
      return envoyerValides(suivi);
    case "suivi":
      return afficherSuivi(suivi);
    case "cycle":
      await verifier(suivi);
      console.log();
      await envoyerValides(suivi);
      console.log();
      await rediger(suivi);
      if (!config().validationManuelle) {
        console.log();
        await envoyerValides(suivi);
      }
      return;
    case "test-connexion":
      return testerConnexion();
    default:
      console.log(AIDE);
  }
}

main().catch((erreur: unknown) => {
  if (erreur instanceof ErreurConfig) {
    console.error(`Configuration : ${erreur.message}`);
  } else if (erreur instanceof Anthropic.AuthenticationError || erreur instanceof Anthropic.PermissionDeniedError) {
    console.error("Claude refuse la clé API : vérifie ANTHROPIC_API_KEY dans le fichier .env.");
  } else if ((erreur as { code?: string }).code === "EAUTH" || (erreur as { authenticationFailed?: boolean }).authenticationFailed) {
    console.error(
      "Gmail refuse la connexion : vérifie GMAIL_ADRESSE et GMAIL_MOT_DE_PASSE_APPLICATION (un mot de passe d'application, pas ton mot de passe habituel).",
    );
  } else {
    console.error(erreur);
  }
  process.exitCode = 1;
});
