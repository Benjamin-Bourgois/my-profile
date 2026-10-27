import { existsSync, mkdirSync, readFileSync, renameSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { DOSSIER_DONNEES, ErreurConfig, FICHIER_PROSPECTS } from "./config.ts";

export type Etape = "initial" | "relance1" | "relance2";
export const ETAPES: Etape[] = ["initial", "relance1", "relance2"];
export const NOM_ETAPE: Record<Etape, string> = { initial: "1er email", relance1: "relance 1", relance2: "relance 2" };

export type Message = {
  etape: Etape;
  sujet: string;
  corps: string;
  statut: "brouillon" | "valide" | "envoye";
  redigeLe: string;
  envoyeLe?: string;
  messageId?: string;
};

export type StatutProspect = "actif" | "repondu" | "desinscrit" | "erreur";

export type Prospect = {
  email: string;
  nom: string;
  etablissement: string;
  ville: string;
  notes: string;
  statut: StatutProspect;
  /** Pourquoi le statut a changé (réponse reçue, adresse invalide…). */
  detailStatut?: string;
  messages: Message[];
};

export type Suivi = { prospects: Record<string, Prospect> };

const FICHIER_SUIVI = path.join(DOSSIER_DONNEES, "suivi.json");
/** Liste des personnes qui ne veulent plus être contactées. On n'y retire jamais rien. */
const FICHIER_DESINSCRITS = path.join(DOSSIER_DONNEES, "desinscrits.txt");
export const DOSSIER_BROUILLONS = path.join(DOSSIER_DONNEES, "brouillons");

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export const normaliserEmail = (email: string) => email.trim().toLowerCase();

export function chargerSuivi(): Suivi {
  if (!existsSync(FICHIER_SUIVI)) return { prospects: {} };
  return JSON.parse(readFileSync(FICHIER_SUIVI, "utf8")) as Suivi;
}

/** Écrit dans un fichier temporaire puis le renomme : un arrêt brutal ne corrompt pas le suivi. */
export function sauverSuivi(suivi: Suivi) {
  mkdirSync(DOSSIER_DONNEES, { recursive: true });
  const temporaire = `${FICHIER_SUIVI}.tmp`;
  writeFileSync(temporaire, JSON.stringify(suivi, null, 2));
  renameSync(temporaire, FICHIER_SUIVI);
}

export function lireDesinscrits(): Set<string> {
  if (!existsSync(FICHIER_DESINSCRITS)) return new Set();
  return new Set(
    readFileSync(FICHIER_DESINSCRITS, "utf8")
      .split("\n")
      .map(normaliserEmail)
      .filter(Boolean),
  );
}

export function ajouterDesinscrit(email: string) {
  if (lireDesinscrits().has(email)) return;
  mkdirSync(DOSSIER_DONNEES, { recursive: true });
  appendFileSync(FICHIER_DESINSCRITS, `${email}\n`);
}

type LigneCsv = Partial<Record<"email" | "nom" | "etablissement" | "ville" | "notes", string>>;

/**
 * Ajoute au suivi les nouveaux prospects de prospects.csv.
 * Les prospects déjà suivis ne sont pas modifiés, sauf leurs notes et leur nom.
 */
export function importerProspects(suivi: Suivi): { ajoutes: number; ignores: string[] } {
  if (!existsSync(FICHIER_PROSPECTS)) {
    throw new ErreurConfig("Le fichier prospects.csv est introuvable : copie prospects.exemple.csv en prospects.csv et remplis-le.");
  }
  const lignes = parse(readFileSync(FICHIER_PROSPECTS, "utf8"), {
    columns: (entetes: string[]) => entetes.map((entete) => entete.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter: [",", ";"],
  }) as LigneCsv[];

  const desinscrits = lireDesinscrits();
  const ignores: string[] = [];
  let ajoutes = 0;
  lignes.forEach((ligne, index) => {
    const email = normaliserEmail(ligne.email ?? "");
    if (!EMAIL.test(email)) {
      ignores.push(`ligne ${index + 2} : adresse email invalide « ${ligne.email ?? ""} »`);
      return;
    }
    const existant = suivi.prospects[email];
    const infos = {
      nom: ligne.nom ?? "",
      etablissement: ligne.etablissement ?? "",
      ville: ligne.ville ?? "",
      notes: ligne.notes ?? "",
    };
    if (existant) {
      Object.assign(existant, infos);
      return;
    }
    suivi.prospects[email] = {
      email,
      ...infos,
      statut: desinscrits.has(email) ? "desinscrit" : "actif",
      messages: [],
    };
    ajoutes++;
  });
  return { ajoutes, ignores };
}

export const messageEnvoye = (prospect: Prospect, etape: Etape) =>
  prospect.messages.find((message) => message.etape === etape && message.statut === "envoye");

export const joursDepuis = (dateIso: string, maintenant = new Date()) =>
  (maintenant.getTime() - new Date(dateIso).getTime()) / 86_400_000;

/** Nombre d'emails envoyés aujourd'hui (date locale), tous prospects confondus. */
export function envoyesAujourdhui(suivi: Suivi, maintenant = new Date()): number {
  const jour = maintenant.toDateString();
  return Object.values(suivi.prospects)
    .flatMap((prospect) => prospect.messages)
    .filter((message) => message.envoyeLe && new Date(message.envoyeLe).toDateString() === jour).length;
}
