# Commande à table

Web app de commande à table pour les bars. Le client approche son téléphone de la
carte posée sur la table (puce NFC ou QR code), voit la carte du bar, commande et
paie. La commande arrive en temps réel sur l'écran du bar avec le numéro de table.

> **Avancement**
> - ✅ Étape 1 : base de données, sécurité, données de démo, page client (lecture de la carte)
> - ✅ Étape 2 : panier, commande « Payer au serveur », suivi en direct, écran du bar en temps réel
> - ✅ Étape 3 : paiement en ligne Stripe Checkout (mode test), confirmé par webhook
> - ✅ Étape 4 : espace gérant (commandes du jour, carte, tables et cartes NFC, QR codes, réglages)
> - ⏳ Étape 5 : finitions et scénario de démonstration

---

## Comment ça marche

| Brique | Rôle | Prix pour démarrer |
|---|---|---|
| **Next.js** (dossier `src/`) | Le site : pages client, écran du bar, admin | gratuit |
| **Supabase** | Base de données, connexion du personnel, temps réel, photos | gratuit (le projet se met en pause après 7 jours sans visite : un clic pour le réveiller) |
| **Vercel** | Met le site en ligne à chaque modification sur GitHub | gratuit (usage non commercial ; offre Pro dès que tu factures un bar) |
| **Stripe** | Paiement par carte, Apple Pay, Google Pay | gratuit en mode test, commission sur les vrais paiements |

### Les adresses du site

| Adresse | Pour qui |
|---|---|
| `/` | Page de présentation |
| `/t/<lien-secret>` | Le client (adresse écrite dans la puce NFC / le QR code) : carte et panier |
| `/t/<lien-secret>/commande/<n°>` | Le client : suivi de sa commande, mis à jour toutes les 4 secondes |
| `/connexion` | Connexion du personnel et du gérant |
| `/bar` | Écran du bar (tablette) : commandes en temps réel |
| `/admin` | Espace gérant : commandes du jour et totaux |
| `/admin/carte` | Catégories, produits, prix, photos, disponibilité |
| `/admin/tables` | Tables, liens des cartes NFC, QR codes, désactiver / nouveau lien |
| `/admin/tables/imprimer` | Planche de QR codes à imprimer |
| `/admin/reglages` | Nom du bar, logo, modes de paiement |

### Les liens des cartes NFC

Chaque table a un lien secret de 12 caractères tirés au hasard, par exemple
`https://commande-bar.vercel.app/t/K7mQ2xP9aRfT`. La puce ne contient que ce lien :
le nom de la table et le bar sont dans la base de données. On peut donc renommer
ou déplacer une table **sans reprogrammer la carte**. Si une carte est perdue ou
volée, on « régénère » le lien : l'ancien cesse immédiatement de fonctionner.

### Sécurité

- Les téléphones des clients n'ont **aucun accès direct** à la base de données :
  ils passent par le serveur de l'application, qui appelle des fonctions SQL
  vérifiant tout (lien de table, disponibilité, appartenance au bar).
- Les **prix sont recalculés** à partir de la base : le prix envoyé par le
  téléphone est ignoré.
- **Row Level Security** : chaque membre du personnel ne voit que les données de
  son bar ; seul le gérant peut modifier la carte, les tables et les réglages.
- **Anti-abus** : 5 commandes maximum par table toutes les 2 minutes (réglable dans
  `supabase/1-structure.sql`, fonction `create_order`).
- **Paiement en ligne** : la commande est créée « en attente de paiement », invisible
  au bar. Elle ne devient « Payée » qu'à réception du message **signé** de Stripe
  (webhook), après vérification du montant. Un paiement abandonné expire au bout de
  30 minutes et la commande est annulée.
- Les **clés secrètes** sont uniquement dans les variables d'environnement
  (Vercel), jamais dans le code.

---

## Installation pas à pas (sans rien installer sur ton ordinateur)

### 1. Supabase (la base de données)

1. Va sur <https://supabase.com> → **Start your project** → **Continue with GitHub**.
2. Crée une organisation (type *Personal*, plan *Free*).
3. **New project** :
   - *Name* : `commande-bar`
   - *Database password* : clique sur **Generate a password** et garde-le dans un endroit sûr
   - *Region* : **West EU (Paris)**
   - laisse le reste par défaut → **Create new project** (2 minutes d'attente).
4. Menu de gauche → **SQL Editor** → **New query** → colle **tout** le contenu de
   [`supabase/1-structure.sql`](supabase/1-structure.sql) → **Run**.
   Attendu : « Success. No rows returned ». (Si Supabase demande une confirmation, accepte.)
5. Menu de gauche → **Authentication** → **Users** → **Add user** → **Create new user**,
   coche **Auto Confirm User**, et crée ces deux comptes (choisis les mots de passe et note-les) :
   - `gerant@comptoir-demo.fr` (le gérant)
   - `bar@comptoir-demo.fr` (le personnel du bar)
6. **SQL Editor** → **New query** → colle tout [`supabase/2-donnees-demo.sql`](supabase/2-donnees-demo.sql)
   → **Run**. Attendu : la liste des 10 tables avec leur lien (`/t/…`). Garde-la.
7. **SQL Editor** → **New query** → colle tout [`supabase/3-etape-2.sql`](supabase/3-etape-2.sql) → **Run**
   (fonctions de l'écran du bar). Attendu : « Success. No rows returned ».
   Puis de même avec [`supabase/4-etape-4.sql`](supabase/4-etape-4.sql) (espace gérant).
8. Récupère 3 valeurs (elles serviront dans Vercel) :
   - **Project URL** (`https://xxxx.supabase.co`) : *Project Settings → Data API*,
     ou bouton **Connect** en haut de l'écran. (C'est aussi `https://` + l'identifiant
     qui suit `/project/` dans l'adresse du tableau de bord + `.supabase.co`.)
   - **Publishable key** (`sb_publishable_…`) : *Project Settings → API Keys*.
   - **Secret key** (`sb_secret_…`) : *Project Settings → API Keys*, section *Secret keys*.
     ⚠️ Elle donne tous les droits : ne la partage jamais.

   Si ton projet n'affiche que des « Legacy API keys », prends la clé `anon` comme
   publishable key et la clé `service_role` comme secret key : ça fonctionne aussi.

### 2. Vercel (la mise en ligne)

Vercel publie la branche principale (`main`) du dépôt GitHub : le code doit donc y être.

1. Va sur <https://vercel.com/signup> → **Hobby** → **Continue with GitHub**.
2. **Add New… → Project** → à côté du dépôt `my-profile`, **Import**.
   (S'il n'apparaît pas : **Adjust GitHub App Permissions** et autorise ce dépôt.)
3. Sur l'écran **Configure Project** :
   - *Project Name* : `commande-bar`
   - *Root Directory* : **Edit** → choisis le dossier `commande-bar` → **Continue**
     (le *Framework Preset* passe tout seul à **Next.js**)
   - *Environment Variables* : ajoute les 3 variables, **avec le bon type** :

     | Key | Value | Type |
     |---|---|---|
     | `NEXT_PUBLIC_SUPABASE_URL` | la Project URL | **Config** |
     | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la publishable key | **Config** |
     | `SUPABASE_SECRET_KEY` | la secret key | **Secret** |

     ⚠️ Les variables qui commencent par `NEXT_PUBLIC_` doivent être de type **Config** :
     elles sont publiques par nature (la sécurité repose sur les règles de la base).
     Une variable enregistrée en *Secret* ne peut plus être passée en *Config* :
     il faut la supprimer (**⋯ → Remove**) puis la recréer.

4. **Deploy** → 1 à 2 minutes → l'adresse du site s'affiche dans **Domains**
   (par exemple `commande-bar.vercel.app`).

Le fichier `vercel.json` place le site à **Paris** (`cdg1`), à côté de la base Supabase
(région *West EU (Paris)*) : chaque clic évite un aller-retour transatlantique. Si ton
projet Supabase est dans une autre région, choisis la région Vercel la plus proche dans ce
fichier (ex. `fra1` pour Francfort, `dub1` pour Dublin).

Ensuite, chaque modification fusionnée dans `main` sur GitHub est mise en ligne
automatiquement. Si tu changes une variable d'environnement : **Deployments** → menu
`⋯` du dernier déploiement → **Redeploy**.

### 3. La carte NFC

1. Installe l'application gratuite **NFC Tools** (iPhone ou Android).
2. **Écrire** → **Ajouter un enregistrement** → **URL / URI** → colle l'adresse
   complète de la table, par exemple `https://commande-bar.vercel.app/t/K7mQ2xP9aRfT`
   → **OK** → **Écrire** → approche la carte.
3. Teste : téléphone déverrouillé, approche-le de la carte. Sur iPhone, une
   notification apparaît en haut de l'écran : touche-la.

⚠️ **Pour les vrais bars** :
- Le domaine est écrit dans la puce. Achète ton propre nom de domaine (≈ 10 €/an,
  à brancher dans Vercel → Settings → Domains) **avant** de programmer les cartes
  d'un client, pour ne jamais avoir à les reprogrammer.
- Une fois une carte programmée, **verrouille-la** dans NFC Tools (*Autres → Verrouiller
  le tag*) pour que personne ne puisse la réécrire. C'est irréversible : pas pendant les tests.

### 4. Stripe (paiement en ligne, mode test)

Le mode test ne demande ni SIRET ni compte bancaire, et aucun argent réel ne circule.

1. Crée un compte sur <https://dashboard.stripe.com/register> (email, nom, mot de passe).
   Si Stripe propose d'activer les paiements, passe cette étape (**plus tard**).
2. Vérifie en haut du tableau de bord que tu es en **mode test** (ou dans un **Sandbox**).
3. **Développeurs → Clés API** → **Créer une clé restreinte** (recommandé par Stripe : si elle
   fuitait, elle ne permettrait que de créer des pages de paiement) :
   - nom : `commande-bar` ;
   - permission : **Checkout Sessions → Écriture** (tout le reste : Aucun) ;
   - copie la clé `rk_test_…`.
   (À défaut, la clé secrète `sk_test_…` fonctionne aussi, mais elle donne tous les droits.)
4. **Développeurs → Webhooks → Ajouter une destination** (ou *Ajouter un endpoint*) :
   - événements à cocher : `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
     `checkout.session.expired` ;
   - type : **Endpoint de webhook** ;
   - URL : `https://<ton-adresse>/api/stripe/webhook`
     (ex. `https://commande-bar.vercel.app/api/stripe/webhook`).
   Une fois créé, copie son **secret de signature** `whsec_…`.
5. Dans Vercel → **Environment Variables**, ajoute (type **Secret**) :

   | Key | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | la clé restreinte `rk_test_…` (ou `sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | le secret `whsec_…` |

6. Remets le site en ligne (nouveau déploiement). Le choix **« Payer maintenant »**
   apparaît alors dans le panier, à côté de « Payer au serveur ».

**Sécurité du compte Stripe** : active la double authentification avec une application
(Google Authenticator…) ou une clé d'accès, plutôt que par SMS.

**Pour revendre à plusieurs bars (plus tard) : Stripe Connect.** Aujourd'hui, l'argent
arrive sur ton compte Stripe. Pour que chaque bar encaisse directement, le modèle
recommandé par Stripe pour une plateforme comme Tapigo est le « SaaS avec paiements » :
chaque bar a son propre compte Stripe connecté (API Accounts v2, tableau de bord Stripe
complet, frais et litiges à la charge du bar), les paiements sont des « direct charges »
au nom du bar, et Tapigo peut prélever une commission (`application_fee_amount`).
La base est prête : colonne `venues.stripe_account_id`.

**Cartes bancaires de test** (date d'expiration future, CVC et code postal au choix) :

| Carte | Résultat |
|---|---|
| `4242 4242 4242 4242` | paiement accepté |
| `4000 0025 0000 3155` | demande une validation 3D Secure (accepte-la dans la fenêtre de test) |
| `4000 0000 0000 9995` | paiement refusé (fonds insuffisants) |

Apple Pay / Google Pay s'affichent automatiquement sur la page Stripe si le téléphone
en est équipé (Safari avec une carte dans Wallet, Chrome avec une carte enregistrée).
En mode test, rien n'est débité.

---

## L'écran du bar (tablette)

1. Sur la tablette, ouvre `https://<ton-adresse>/bar` et connecte-toi
   (`bar@comptoir-demo.fr` ou `gerant@comptoir-demo.fr`).
2. Touche **« Activer le son »** (obligatoire à chaque ouverture : les navigateurs
   interdisent le son sans un premier appui).
3. Réglages de la tablette : **verrouillage automatique → Jamais**, volume au maximum.
   Astuce : « Partager → Sur l'écran d'accueil » pour l'ouvrir comme une application.

Ce que fait l'écran :
- les nouvelles commandes arrivent **sans recharger** (pastille « ● En direct »),
  avec un signal sonore ; si le temps réel est coupé, l'écran se relit tout seul
  toutes les 20 secondes (« ○ Actualisation auto ») ;
- **numéro de table en très grand**, articles, commentaire, heure, paiement
  (« Payé en ligne » / « À encaisser ») ;
- boutons **En préparation → Servie**, **Encaissé**, **Annuler** (commandes non payées) ;
- la carte devient **orange après 5 minutes** d'attente, **rouge après 10 minutes**
  (réglable dans `src/components/bar/OrderCard.tsx`) ;
- les commandes servies passent dans **Historique du jour** (une « journée » va de 5 h à 5 h).

---

## L'espace gérant

Connexion avec le compte gérant (`gerant@comptoir-demo.fr`) sur `https://<ton-adresse>/admin`.
Le compte du personnel (`bar@…`) n'y a pas accès : il ne voit que l'écran du bar.

- **Commandes du jour** : chiffre d'affaires, nombre de commandes, payé en ligne,
  encaissé au bar, reste à encaisser, et la liste détaillée (jours précédents accessibles).
- **Carte** : ajouter / renommer / ordonner les catégories ; ajouter, modifier, ordonner,
  supprimer les produits ; photo (réduite automatiquement à 800 px pour la 4G) ;
  interrupteur **Disponible / Épuisé** pris en compte immédiatement chez les clients.
- **Tables & cartes NFC** : pour chaque table, le lien à copier (pour programmer la puce),
  le QR code à télécharger, et les actions **Renommer** (la carte n'est pas à reprogrammer),
  **Désactiver**, **Nouveau lien** (carte perdue ou volée : l'ancienne cesse de fonctionner),
  **Supprimer**. Une planche de QR codes est prête à imprimer.
- **Réglages** : nom du bar, logo, « Payer au serveur » et « Paiement en ligne » activables.

Les liens et QR codes utilisent automatiquement l'adresse de production Vercel. Si tu
branches ton propre nom de domaine, ajoute dans Vercel la variable `SITE_URL`
(ex. `https://commande.mon-domaine.fr`, type *Config*) **avant** de programmer les cartes.

---

## Dépannage

La page d'une table affiche un message d'aide en cas de problème de configuration :

| Message | Solution |
|---|---|
| « Configuration incomplète » | Une variable manque dans Vercel → ajoute-la puis **Redeploy**. |
| « La clé Supabase est refusée » | `SUPABASE_SECRET_KEY` mal copiée. |
| « Accès refusé par la base » | Tu as mis la publishable key à la place de la secret key. |
| « La base n'est pas installée » | Exécute `supabase/1-structure.sql`. |
| « Supabase est injoignable » / « Cette adresse Supabase n'existe pas » | `NEXT_PUBLIC_SUPABASE_URL` incorrecte ou enregistrée en type *Secret* au lieu de *Config* (voir plus haut), ou projet Supabase en pause (réactive-le depuis supabase.com). Après correction : nouveau déploiement. |
| « Carte non reconnue » | Lien incomplet, table désactivée ou lien régénéré. |
| « Base incomplète : exécutez le script supabase/4-etape-4.sql » (espace gérant) | Exécute ce script dans Supabase → SQL Editor. |
| « Envoi impossible » en ajoutant une photo | Le stockage des images n'a pas été créé : relance la fin de `1-structure.sql` (partie « Photos des produits ») ou crée un bucket public `images` dans Supabase → Storage. |
| « Payer maintenant » n'apparaît pas | `STRIPE_SECRET_KEY` ou `STRIPE_WEBHOOK_SECRET` manquante, ou pas de nouveau déploiement depuis. |
| Paiement accepté mais commande absente du bar (« Paiement en cours… » qui dure) | Le webhook n'arrive pas : dans Stripe → Webhooks → ta destination, regarde les envois en échec. Vérifie l'URL (`…/api/stripe/webhook`) et que `STRIPE_WEBHOOK_SECRET` est bien le secret de **cette** destination. Dans Vercel → Logs, cherche « Webhook Stripe refusé ». |
| « Le paiement en ligne est momentanément indisponible » | Clé `STRIPE_SECRET_KEY` incorrecte, ou clé restreinte sans la permission « Checkout Sessions : écriture » (Vercel → Logs : « Ouverture du paiement Stripe impossible »). |

Le détail technique des erreurs est visible dans Vercel → ton projet → **Logs**.

---

## Ajouter un nouveau bar

Pas encore d'écran pour ça (la création d'un bar se fait une fois). Dans Supabase :

1. **Authentication → Users → Add user** : crée le compte du gérant (Auto Confirm).
2. **SQL Editor** :

```sql
insert into public.venues (slug, name) values ('nom-du-bar', 'Nom du bar');

insert into public.venue_members (venue_id, user_id, role)
select v.id, u.id, 'owner'
from public.venues v, auth.users u
where v.slug = 'nom-du-bar' and u.email = 'gerant@nom-du-bar.fr';
```

Le gérant se connecte ensuite et crée ses tables et sa carte depuis l'admin.
Chaque bar est totalement isolé des autres.

---

## Pour les développeurs

```bash
cd commande-bar
cp .env.example .env.local   # puis remplis les valeurs
npm install
npm run dev                  # http://localhost:3000
npm run lint && npm run typecheck && npm run build
```

- `src/app/` : les pages (App Router de Next.js 16)
- `src/components/` : les éléments d'interface
- `src/lib/` : accès à Supabase, formatage, configuration
- `supabase/` : scripts SQL (structure, règles de sécurité, données de démo)
