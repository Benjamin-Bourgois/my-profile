# Agent de prospection par email

Petit programme qui prospecte des bars par email depuis ta boîte Gmail :

1. tu remplis une liste de prospects (`prospects.csv`) ;
2. **Claude rédige** un email personnalisé pour chacun, à partir de ton offre (`offre.md`) et des notes sur le prospect ;
3. **tu relis** et tu corriges si besoin, puis tu valides ;
4. l'agent **envoie** depuis ton Gmail, à un rythme raisonnable (20 par jour par défaut, avec des pauses) ;
5. il **relance** automatiquement à J+3 puis J+7 ceux qui n'ont pas répondu, dans le même fil de discussion ;
6. il **lit ta boîte** : dès qu'un prospect répond, ses relances s'arrêtent ; s'il répond « STOP », il n'est plus jamais contacté.

Les emails partent vraiment de ton Gmail : ils apparaissent dans « Messages envoyés » et les réponses arrivent normalement dans ta boîte de réception.

---

## 1. Installation (une seule fois)

### a. Node.js

Il faut Node.js 22.18 ou plus récent : <https://nodejs.org> (version « LTS »).
Vérifie dans un terminal : `node --version`.

### b. Mot de passe d'application Gmail

L'agent ne connaît pas ton mot de passe Gmail : il utilise un **mot de passe d'application**, que tu peux supprimer à tout moment.

1. Active la **validation en deux étapes** sur ton compte Google : <https://myaccount.google.com/signinoptions/twosv>
2. Va sur <https://myaccount.google.com/apppasswords>, donne un nom (par exemple « Prospection ») et clique sur **Créer**.
3. Google affiche 16 lettres : copie-les, c'est ton `GMAIL_MOT_DE_PASSE_APPLICATION`.

### c. Clé API Claude

Crée une clé sur <https://platform.claude.com/settings/keys> (il faut un peu de crédit sur le compte).
Coût indicatif : environ 1 à 4 centimes par email rédigé.

### d. Configuration

Dans le dossier `prospection/` :

```bash
npm install
cp .env.exemple .env                       # puis remplis .env
cp prospects.exemple.csv prospects.csv     # puis remplis prospects.csv
npm run test-connexion
```

`test-connexion` doit afficher trois ✓ (offre, Gmail, Claude).

---

## 2. Les fichiers à remplir

### `offre.md` : ce que tu proposes

C'est le brief de Claude. Décris ton produit, ce qu'il apporte, l'appel à l'action (par exemple une démo de 15 minutes) et le ton voulu.
**Claude n'invente rien** : il ne parle que de ce qui est écrit ici et dans les notes du prospect.

### `prospects.csv` : la liste des prospects

Ouvrable avec Excel, LibreOffice ou Google Sheets (export CSV). Colonnes :

| Colonne | Obligatoire | Exemple |
|---|---|---|
| `email` | oui | `contact@lecomptoir.fr` |
| `nom` | non | `Julie Martin` (sinon « Bonjour, ») |
| `etablissement` | non | `Le Comptoir` |
| `ville` | non | `Lyon` |
| `notes` | non | `Bar à bières, grande terrasse, très fréquenté le week-end` |

Plus les notes sont précises, plus l'email est personnalisé. Tu peux ajouter des lignes à tout moment : les nouveaux prospects sont pris en compte au prochain lancement, et ceux déjà contactés ne le sont jamais deux fois.

### `.env` : les réglages

| Réglage | Par défaut | Rôle |
|---|---|---|
| `LIMITE_PAR_JOUR` | 20 | Nombre maximum d'emails par jour, relances comprises |
| `DELAI_MIN_SECONDES` / `DELAI_MAX_SECONDES` | 60 / 180 | Pause aléatoire entre deux envois |
| `RELANCE_1_JOURS` / `RELANCE_2_JOURS` | 3 / 7 | Relances sans réponse, en jours après le premier email |
| `VALIDATION_MANUELLE` | oui | `non` = les emails partent sans relecture |

---

## 3. Au quotidien

Une seule commande par jour suffit :

```bash
npm run cycle
```

Elle lit les réponses, envoie les emails que tu as validés, puis fait rédiger les suivants (nouveaux prospects et relances).
Ensuite, relis les brouillons et valide-les :

```bash
npm run apercu      # affiche les brouillons
npm run valider     # valide tout
```

Les brouillons sont aussi des fichiers texte dans `donnees/brouillons/` : ouvre-les, modifie l'objet ou le texte, enregistre, puis lance `npm run valider`. Tes modifications sont celles qui partiront.

Ils seront envoyés au prochain `npm run cycle` (ou tout de suite avec `npm run envoyer`). **Laisse la fenêtre ouverte pendant l'envoi** : avec les pauses, 20 emails prennent environ 40 minutes.

### Toutes les commandes

| Commande | Effet |
|---|---|
| `npm run cycle` | Tout en un : réponses → envoi des emails validés → rédaction des suivants |
| `npm run suivi` | Tableau de bord : qui a été contacté, qui a répondu, taux de réponse |
| `npm run apercu` | Affiche les brouillons à relire |
| `npm run valider` | Valide tous les brouillons (`npm run valider -- adresse@exemple.fr` pour un seul) |
| `npm run rejeter -- adresse@exemple.fr` | Supprime un brouillon, Claude le réécrira au prochain passage |
| `npm run exclure -- adresse@exemple.fr` | Ne plus jamais contacter cette adresse |
| `npm run rediger` | Fait seulement la rédaction |
| `npm run envoyer` | Fait seulement l'envoi (après lecture des réponses) |
| `npm run verifier` | Fait seulement la lecture des réponses |
| `npm run test-connexion` | Vérifie la configuration, Gmail et Claude |

### Quand un prospect répond

L'agent arrête ses relances et l'affiche (`✉ Réponse de …`). **La suite, c'est toi** : réponds-lui directement depuis Gmail.
Les réponses du type « STOP », « désinscrivez-moi » ou « pas intéressé » le placent définitivement dans `donnees/desinscrits.txt`. Si une adresse n'existe pas, le message d'erreur de Gmail est détecté et le prospect est mis de côté.

---

## 4. Bonnes pratiques (pour ne pas finir en spam)

- **Commence doucement** : 10 à 15 emails par jour la première semaine, puis 20 à 30. Gmail limite un compte personnel à 500 envois par jour, mais au-delà de quelques dizaines d'emails de prospection, tu risques le dossier spam ou une suspension.
- **Peu de prospects, bien ciblés** : un email qui parle vraiment du bar (grâce aux notes) obtient beaucoup plus de réponses qu'un message générique.
- **Relis les premiers emails** avant de passer `VALIDATION_MANUELLE` à `non`.
- **Réponds vite** quand quelqu'un répond.
- Plus tard, une adresse sur ton propre domaine (par exemple `benjamin@tonsite.fr`, avec Google Workspace) fait plus professionnel. Il suffira de changer `GMAIL_ADRESSE` et le mot de passe d'application.

## 5. Ce que dit la loi (RGPD, prospection B2B en France)

- Écrire à une **entreprise** sans accord préalable est autorisé si le message concerne son activité (un bar, pour un outil destiné aux bars), à condition d'identifier l'expéditeur et de permettre de refuser simplement.
- L'agent ajoute à chaque email une mention de désinscription (« répondez STOP ») et un en-tête de désinscription reconnu par Gmail. Il respecte les refus automatiquement et pour toujours.
- Utilise de préférence les **adresses génériques** des établissements (contact@, bonjour@…), trouvées sur leur site ou leur fiche Google, plutôt que des adresses personnelles.
- Les données des prospects (`prospects.csv`, dossier `donnees/`) restent sur ton ordinateur : elles ne sont jamais envoyées sur GitHub (voir `.gitignore`). Elles sont seulement transmises à Claude pour rédiger l'email.

## 6. Dépannage

| Message | Solution |
|---|---|
| `Gmail refuse la connexion` | Vérifie `GMAIL_ADRESSE` et le mot de passe d'application (pas ton mot de passe habituel). La validation en deux étapes doit être active. |
| `Claude refuse la clé API` | Vérifie `ANTHROPIC_API_KEY` et le crédit du compte. |
| `Limite du jour atteinte` | Normal : la suite partira demain. |
| Un email doit être réécrit | `npm run rejeter -- adresse@exemple.fr`, puis `npm run rediger`. |
