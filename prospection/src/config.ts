import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Dossier « prospection/ » (indépendant du dossier depuis lequel on lance la commande). */
export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DOSSIER_DONNEES = path.join(RACINE, "donnees");
export const FICHIER_PROSPECTS = path.join(RACINE, "prospects.csv");
export const FICHIER_OFFRE = path.join(RACINE, "offre.md");

const fichierEnv = path.join(RACINE, ".env");
if (existsSync(fichierEnv)) process.loadEnvFile(fichierEnv);

export class ErreurConfig extends Error {}

function texte(nom: string): string {
  const valeur = process.env[nom]?.trim();
  if (!valeur) throw new ErreurConfig(`${nom} manque dans le fichier .env (voir .env.exemple).`);
  return valeur;
}

function nombre(nom: string, defaut: number, min: number, max: number): number {
  const brut = process.env[nom]?.trim();
  if (!brut) return defaut;
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur < min || valeur > max) {
    throw new ErreurConfig(`${nom} doit être un nombre entier entre ${min} et ${max} (actuellement « ${brut} »).`);
  }
  return valeur;
}

function oui(nom: string, defaut: boolean): boolean {
  const brut = process.env[nom]?.trim().toLowerCase();
  if (!brut) return defaut;
  if (["oui", "o", "true", "1", "yes"].includes(brut)) return true;
  if (["non", "n", "false", "0", "no"].includes(brut)) return false;
  throw new ErreurConfig(`${nom} doit valoir « oui » ou « non » (actuellement « ${brut} »).`);
}

export type Config = ReturnType<typeof lireConfig>;

let cache: Config | undefined;

export function config(): Config {
  cache ??= lireConfig();
  return cache;
}

function lireConfig() {
  const delaiMin = nombre("DELAI_MIN_SECONDES", 60, 5, 3600);
  const delaiMax = nombre("DELAI_MAX_SECONDES", 180, 5, 3600);
  if (delaiMax < delaiMin) throw new ErreurConfig("DELAI_MAX_SECONDES doit être supérieur ou égal à DELAI_MIN_SECONDES.");
  const relance1 = nombre("RELANCE_1_JOURS", 3, 1, 60);
  const relance2 = nombre("RELANCE_2_JOURS", 7, 2, 90);
  if (relance2 <= relance1) throw new ErreurConfig("RELANCE_2_JOURS doit être supérieur à RELANCE_1_JOURS.");

  return {
    gmailAdresse: texte("GMAIL_ADRESSE").toLowerCase(),
    // Google affiche le mot de passe d'application en 4 groupes : les espaces ne comptent pas.
    gmailMotDePasse: texte("GMAIL_MOT_DE_PASSE_APPLICATION").replace(/\s+/g, ""),
    expediteurNom: texte("EXPEDITEUR_NOM"),
    signature: (process.env.EXPEDITEUR_SIGNATURE ?? "").replace(/\\n/g, "\n").trim(),
    limiteParJour: nombre("LIMITE_PAR_JOUR", 20, 1, 400),
    delaiMinSecondes: delaiMin,
    delaiMaxSecondes: delaiMax,
    relance1Jours: relance1,
    relance2Jours: relance2,
    validationManuelle: oui("VALIDATION_MANUELLE", true),
  };
}

export function lireOffre(): string {
  if (!existsSync(FICHIER_OFFRE)) throw new ErreurConfig("Le fichier offre.md est introuvable.");
  const offre = readFileSync(FICHIER_OFFRE, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!offre) throw new ErreurConfig("Le fichier offre.md est vide : décris ce que tu proposes.");
  return offre;
}
