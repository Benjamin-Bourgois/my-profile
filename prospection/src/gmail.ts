import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer, { type Transporter } from "nodemailer";

import { config } from "./config.ts";
import { ajouterDesinscrit, type Message, type Prospect, type Suivi } from "./donnees.ts";

// --- Envoi (SMTP) ---

let transporteur: Transporter | undefined;

function smtp() {
  const cfg = config();
  transporteur ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: cfg.gmailAdresse, pass: cfg.gmailMotDePasse },
  });
  return transporteur;
}

export const MENTION_DESINSCRIPTION =
  "Vous recevez ce message car votre établissement correspond à mon activité. Pour ne plus être contacté, répondez simplement « STOP ».";

export function texteComplet(message: Message): string {
  const { signature } = config();
  return [message.corps, signature, `--\n${MENTION_DESINSCRIPTION}`].filter(Boolean).join("\n\n");
}

/** Envoie le message et renvoie son identifiant (Message-ID), utilisé pour enchaîner les relances. */
export async function envoyer(prospect: Prospect, message: Message): Promise<string> {
  const cfg = config();
  const initial = prospect.messages.find((m) => m.etape === "initial" && m.messageId);
  const enReponse = message.etape !== "initial" && initial?.messageId;
  const references = prospect.messages.flatMap((m) => (m.messageId ? [m.messageId] : []));
  const info = await smtp().sendMail({
    from: { name: cfg.expediteurNom, address: cfg.gmailAdresse },
    to: prospect.email,
    subject: message.sujet,
    text: texteComplet(message),
    ...(enReponse ? { inReplyTo: references.at(-1), references } : {}),
    headers: {
      "List-Unsubscribe": `<mailto:${cfg.gmailAdresse}?subject=STOP>`,
    },
  });
  return info.messageId;
}

// --- Lecture des réponses (IMAP) ---

function imap() {
  const cfg = config();
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.gmailAdresse, pass: cfg.gmailMotDePasse },
    logger: false,
  });
}

const STOP =
  /(?<!\p{L})(stop|d[ée]sinscri\p{L}*|d[ée]sabonn\p{L}*|ne plus (me |nous )?(contacter|[ée]crire)|pas int[ée]ress[ée]e?s?|unsubscribe)(?!\p{L})/iu;

/** Garde le texte écrit par la personne, sans la citation des emails précédents. */
function sansCitation(texte: string): string {
  const lignes: string[] = [];
  for (const ligne of texte.split(/\r?\n/)) {
    if (/^\s*>/.test(ligne)) continue;
    if (/^(le .+a écrit\s*:|on .+wrote:|-----\s*original message|de\s*:.+@)/i.test(ligne.trim())) break;
    if (ligne.trim() === "--") break;
    lignes.push(ligne);
  }
  return lignes.join("\n").trim();
}

export type Bilan = { reponses: string[]; desinscriptions: string[]; erreurs: string[] };

/**
 * Parcourt la boîte Gmail depuis le premier envoi : toute réponse d'un prospect arrête ses
 * relances ; « STOP » (ou équivalent) l'ajoute à la liste des désinscrits ; un message
 * d'erreur de Gmail (adresse inexistante) le met de côté.
 */
export async function verifierReponses(suivi: Suivi): Promise<Bilan> {
  const bilan: Bilan = { reponses: [], desinscriptions: [], erreurs: [] };
  const premierEnvoi = (prospect: Prospect) =>
    prospect.messages
      .flatMap((message) => (message.envoyeLe ? [new Date(message.envoyeLe)] : []))
      .sort((a, b) => a.getTime() - b.getTime())[0];
  const contactes = Object.values(suivi.prospects).filter((prospect) => prospect.statut === "actif" && premierEnvoi(prospect));
  if (contactes.length === 0) return bilan;

  const depuis = new Date(Math.min(...contactes.map((prospect) => premierEnvoi(prospect)!.getTime())) - 86_400_000);
  const parEmail = new Map(contactes.map((prospect) => [prospect.email, prospect]));
  const moi = config().gmailAdresse;

  const client = imap();
  await client.connect();
  try {
    // « Tous les messages » couvre aussi les réponses archivées ou classées par un filtre.
    const dossiers = await client.list();
    const tous = dossiers.find((dossier) => dossier.specialUse === "\\All")?.path ?? "INBOX";
    const verrou = await client.getMailboxLock(tous, { readOnly: true });
    try {
      const uids = await client.search({ since: depuis }, { uid: true });
      if (!uids || uids.length === 0) return bilan;
      const aLire: number[] = [];
      for await (const message of client.fetch(uids, { envelope: true }, { uid: true })) {
        const de = message.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
        if (de === moi) continue;
        if (parEmail.has(de) || /mailer-daemon|postmaster/.test(de)) aLire.push(message.uid);
      }
      for (const uid of aLire) {
        const message = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!message || !message.source) continue;
        const email = await simpleParser(message.source);
        const de = email.from?.value[0]?.address?.toLowerCase() ?? "";
        const date = email.date ?? message.envelope?.date ?? new Date();

        if (/mailer-daemon|postmaster/.test(de)) {
          const texte = `${email.text ?? ""}\n${email.html || ""}`.toLowerCase();
          for (const prospect of parEmail.values()) {
            if (prospect.statut === "actif" && date >= premierEnvoi(prospect)! && texte.includes(prospect.email)) {
              prospect.statut = "erreur";
              prospect.detailStatut = `Adresse refusée par le serveur de destination (${date.toISOString().slice(0, 10)})`;
              bilan.erreurs.push(prospect.email);
            }
          }
          continue;
        }

        const prospect = parEmail.get(de);
        if (!prospect || prospect.statut !== "actif" || date < premierEnvoi(prospect)!) continue;
        const ecrit = `${email.subject ?? ""}\n${sansCitation(email.text ?? "")}`;
        if (STOP.test(ecrit)) {
          prospect.statut = "desinscrit";
          prospect.detailStatut = `A demandé à ne plus être contacté (${date.toISOString().slice(0, 10)})`;
          ajouterDesinscrit(prospect.email);
          bilan.desinscriptions.push(prospect.email);
        } else {
          prospect.statut = "repondu";
          prospect.detailStatut = `A répondu le ${date.toISOString().slice(0, 10)} : « ${sansCitation(email.text ?? "").replace(/\s+/g, " ").slice(0, 120)} »`;
          bilan.reponses.push(prospect.email);
        }
      }
    } finally {
      verrou.release();
    }
  } finally {
    await client.logout();
  }
  return bilan;
}

/** Vérifie que Gmail accepte les identifiants (envoi et lecture). */
export async function testerGmail() {
  await smtp().verify();
  const client = imap();
  await client.connect();
  await client.logout();
}
