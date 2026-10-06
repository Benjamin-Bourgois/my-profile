# Commande à table

Web app de commande à table pour les bars. Le client approche son téléphone de la
carte posée sur la table (puce NFC, ou QR code de secours) : la carte du bar s'ouvre
dans le navigateur, sans application à installer. Il commande et paie. La commande
arrive aussitôt sur l'écran du bar avec le numéro de table, et le serveur la marque
« Servie » en l'apportant.

**Sommaire**

1. [Ce que fait l'application](#1-ce-que-fait-lapplication)
2. [Accès de démonstration](#2-accès-de-démonstration)
3. [Scénario de démonstration](#3-scénario-de-démonstration)
4. [Installation pas à pas](#4-installation-pas-à-pas)
5. [Au quotidien : écran du bar et espace gérant](#5-au-quotidien--écran-du-bar-et-espace-gérant)
6. [Sécurité](#6-sécurité)
7. [Dépannage](#7-dépannage)
8. [Modifier l'application](#8-modifier-lapplication)
9. [Ajouter un nouveau bar](#9-ajouter-un-nouveau-bar)
10. [Avant de vendre à un vrai bar](#10-avant-de-vendre-à-un-vrai-bar)

---

## 1. Ce que fait l'application

### Les écrans

| Adresse | Pour qui | Contenu |
|---|---|---|
| `/t/<lien-secret>` | Le client (adresse écrite dans la puce NFC / le QR code) | Nom du bar, « Table X », carte par catégories, produits épuisés grisés, panier, commentaire, paiement, pourboire, boutons « Appeler un serveur » / « L'addition », mention sur l'alcool |
| `/t/<lien-secret>/commande/<n°>` | Le client | Numéro de commande, statut mis à jour toutes les 3 s (Reçue → En préparation → Servie), « Commander à nouveau », appel du serveur |
| `/bar` | Le personnel (tablette) | Commandes et appels des tables en temps réel avec signal sonore, numéro de table en très grand, boutons En préparation / Servie / Encaissé, pause des commandes |
| `/admin` | Le gérant | Commandes du jour et totaux (dont pourboires), carte, tables et cartes NFC, QR codes, réglages, pause des commandes |
| `/connexion` | Personnel et gérant | Email + mot de passe |
| `/` | Prospects | Page de présentation |

### Les briques

| Brique | Rôle | Prix pour démarrer |
|---|---|---|
| **Next.js 16** (dossier `src/`) | Le site | gratuit |
| **Supabase** | Base de données, comptes du personnel, temps réel, photos | gratuit (pause après 7 jours sans visite : un clic pour réveiller) |
| **Vercel** | Mise en ligne automatique à chaque mise à jour sur GitHub | gratuit (non commercial) |
| **Stripe** | Paiement carte / Apple Pay / Google Pay | gratuit en test, commission sur les vrais paiements |

### Les liens des cartes NFC

Chaque table a un lien secret de 12 caractères tirés au hasard, par exemple
`https://commande-bar.vercel.app/t/K7mQ2xP9aRfT` : impossible à deviner, jamais
`/table/1`. La puce ne contient que ce lien ; le nom de la table et le bar sont dans
la base. On peut donc **renommer ou déplacer une table sans reprogrammer la carte**.
Carte perdue ou volée : **Nouveau lien** dans l'espace gérant, l'ancienne cesse
immédiatement de fonctionner. Lien inconnu ou désactivé : « Carte non reconnue,
demandez au serveur ».

---

## 2. Accès de démonstration

Bar fictif **« Le Comptoir de Démo »** : 10 tables, 16 produits (bières, cocktails,
softs, planches), l'Espresso martini est volontairement « épuisé ».

| Quoi | Où le trouver |
|---|---|
| **Lien d'une table** (à écrire sur la carte NFC) | Espace gérant → **Tables & cartes NFC** → **Copier le lien** |
| **Écran du bar** | `https://commande-bar.vercel.app/bar` — compte `bar@comptoir-demo.fr` |
| **Espace gérant** | `https://commande-bar.vercel.app/admin` — compte `gerant@comptoir-demo.fr` |
| **Mots de passe** | Ceux choisis à la création des comptes dans Supabase (oubli : voir ci-dessous) |

**Mot de passe oublié** : Supabase → **SQL Editor** → **New query** :

```sql
update auth.users
set encrypted_password = extensions.crypt('NouveauMotDePasse', extensions.gen_salt('bf'))
where email = 'gerant@comptoir-demo.fr';
```

**Cartes bancaires de test Stripe** (date d'expiration future, CVC et code postal au choix) :

| Carte | Résultat |
|---|---|
| `4242 4242 4242 4242` | paiement accepté |
| `4000 0025 0000 3155` | validation 3D Secure demandée (accepte-la dans la fenêtre de test) |
| `4000 0000 0000 9995` | paiement refusé (fonds insuffisants) |

---

## 3. Scénario de démonstration

Matériel : la carte NFC programmée, ton téléphone (le « client »), un ordinateur ou
une tablette (le « bar »). Durée : 5 minutes.

**Avant le rendez-vous**
1. Ouvre l'écran du bar (`/bar`) sur la tablette, connecte-toi avec `bar@…`.
2. Touche **« Activer le son »** (un « ding-dong » confirme). Vérifie la pastille
   **« ● En direct »**. Monte le volume.

**Devant le patron du bar**
1. **Scanner** — Pose la carte sur la table, approche le téléphone : la carte du bar
   s'ouvre, avec « Table X ». *« Aucune application à télécharger. »*
2. **Commander** — Ajoute 2 Mojitos et une Pinte, écris « sans glace », ouvre le panier.
3. **Payer** — Choisis **« Payer maintenant »**, un pourboire de **10 %** → page Stripe → carte `4242 4242 4242 4242`
   (ou Apple Pay / Google Pay). La page de suivi s'affiche : *Commande reçue · Payé en ligne*.
   (Variante : **« Payer au serveur »**, la commande arrive « À encaisser ».)
4. **Voir la commande au bar** — La tablette sonne : **numéro de table en très grand**,
   articles, commentaire en jaune, « ✓ Payé en ligne », « 🙏 Pourboire ».
5. **Préparer puis servir** — Touche **En préparation** : le téléphone affiche
   « En préparation ». Touche **✓ Servie** : le téléphone affiche « Servie » et la
   commande passe dans l'historique.
6. **Appeler un serveur** — Sur le téléphone, **« 🙋 Appeler un serveur »** : la tablette
   sonne (son différent) et affiche « Table X appelle un serveur ». Touche **✓ Fait**.
   Même chose avec **« 🧾 L'addition »**.
7. **Rush** — Sur la tablette, **« ⏸️ Pause des commandes »** : le téléphone affiche
   « Commandes en pause » et ne peut plus commander. **« ▶ Reprendre les commandes »**.
8. **Recommander** — Sur le téléphone, **« Commander à nouveau »**.

**Pour finir, l'espace gérant** (`/admin`)
- Passe un produit en **Épuisé** : il est grisé sur le téléphone.
- Renomme la table de la carte : le nouveau nom s'affiche, **sans reprogrammer la carte**.
- Montre les **Commandes du jour** et le chiffre d'affaires, puis la **planche de QR codes**.

Points forts à souligner : pas d'application, pas d'attente pour commander, le serveur
ne fait plus d'allers-retours pour prendre la commande, paiement sécurisé par Stripe,
carte modifiable en un clic (rupture de stock), cartes NFC remplaçables à distance.

---

## 4. Installation pas à pas

Tout se fait dans le navigateur, rien à installer sur l'ordinateur.

### 4.1 Supabase (la base de données)

1. <https://supabase.com> → **Start your project** → **Continue with GitHub**.
2. Crée une organisation (*Personal*, plan *Free*).
3. **New project** : nom `commande-bar`, mot de passe généré (à garder), région
   **West EU** (Ireland ou Paris, voir `vercel.json` plus bas) → **Create new project**.
4. **SQL Editor** → **New query** → colle **tout** [`supabase/1-structure.sql`](supabase/1-structure.sql)
   → **Run** → « Success. No rows returned ».
5. **Authentication → Users → Add user → Create new user**, coche **Auto Confirm User** :
   `gerant@comptoir-demo.fr` puis `bar@comptoir-demo.fr` (mots de passe à noter).
6. **SQL Editor** : exécute [`supabase/2-donnees-demo.sql`](supabase/2-donnees-demo.sql)
   (bar de démo, affiche les 10 liens de tables), puis
   [`supabase/3-etape-2.sql`](supabase/3-etape-2.sql) (écran du bar),
   [`supabase/4-etape-4.sql`](supabase/4-etape-4.sql) (espace gérant) et
   [`supabase/5-ajouts.sql`](supabase/5-ajouts.sql) (appel du serveur, pourboire, pause).
   Les scripts 3, 4 et 5 peuvent être relancés sans risque.
7. **Authentication → Sign In / Providers** : désactive **Allow new users to sign up**
   (seuls les comptes que tu crées peuvent se connecter).
8. Récupère 3 valeurs pour Vercel :
   - **Project URL** `https://xxxx.supabase.co` (*Project Settings → Data API*, ou bouton **Connect**) ;
   - **Publishable key** `sb_publishable_…` (*Project Settings → API Keys*) ;
   - **Secret key** `sb_secret_…` (même page, *Secret keys*). ⚠️ Ne la partage jamais.

   Projet avec des « Legacy API keys » : clé `anon` = publishable, clé `service_role` = secret.

### 4.2 Vercel (la mise en ligne)

1. <https://vercel.com/signup> → **Hobby** → **Continue with GitHub**.
2. **Add New… → Project** → dépôt `my-profile` → **Import**.
3. **Root Directory** : `commande-bar`. **Environment Variables** :

   | Key | Value | Type |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL | **Config** |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key | **Config** |
   | `SUPABASE_SECRET_KEY` | secret key | **Secret** |
   | `STRIPE_SECRET_KEY` | clé Stripe (voir 4.4) | **Secret** |
   | `STRIPE_WEBHOOK_SECRET` | secret du webhook Stripe (voir 4.4) | **Secret** |
   | `SITE_URL` *(facultatif)* | ton nom de domaine, ex. `https://commande.mon-bar.fr` | **Config** |

   ⚠️ Les variables `NEXT_PUBLIC_…` doivent être en **Config** (elles sont publiques par
   nature). Une variable enregistrée en *Secret* ne peut pas être changée : **⋯ → Remove**
   puis recrée-la.
4. **Deploy**. L'adresse du site est sous **Domains** (ex. `commande-bar.vercel.app`).

`vercel.json` place le site à **Dublin** (`dub1`), à côté de la base (région *West EU
(Ireland)*) : les boutons répondent plus vite. Base à Paris → `cdg1` ; Francfort → `fra1`.

**Mises à jour** : chaque modification fusionnée dans `main` sur GitHub est mise en ligne
automatiquement. Après un changement de variable : **Deployments → ⋯ → Redeploy**.

### 4.3 Les cartes NFC

1. Application gratuite **NFC Tools** (iPhone / Android).
2. Espace gérant → **Tables & cartes NFC** → **Copier le lien** de la table.
3. NFC Tools → **Écrire** → **Ajouter un enregistrement** → **URL / URI** → colle →
   **Écrire** → approche la carte.
4. Test : téléphone déverrouillé contre la carte (iPhone : touche la notification).
5. QR code de secours : **QR code (PNG)** ou **🖨️ Imprimer les QR codes**.

### 4.4 Stripe (paiement en ligne, mode test)

Le mode test ne demande ni SIRET ni compte bancaire ; aucun argent réel ne circule.

1. Compte sur <https://dashboard.stripe.com/register> ; reste en **mode test / Sandbox**.
2. **Développeurs → Clés API → Créer une clé restreinte** : permission
   **Checkout Sessions → Écriture**, le reste **Aucun** → copie `rk_test_…`
   (à défaut, la clé secrète `sk_test_…` fonctionne mais donne tous les droits).
3. **Développeurs → Webhooks → Ajouter une destination** :
   - événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired` ;
   - URL : `https://<ton-adresse>/api/stripe/webhook` ;
   - copie le **secret de signature** `whsec_…`.
4. Ajoute `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` dans Vercel (type **Secret**),
   puis redéploie. Le choix **« Payer maintenant »** apparaît dans le panier.

---

## 5. Au quotidien : écran du bar et espace gérant

### L'écran du bar (tablette)

- Ouvre `/bar`, connecte-toi, touche **« Activer le son »** : un « ding-dong » doit
  retentir (obligatoire à chaque ouverture : les navigateurs bloquent le son sans un
  premier appui). Sur iPhone / iPad, le son passe même en mode silencieux.
- Si l'appareil coupe le son (mise en veille, autre application ouverte), le bandeau
  **« L'appareil a coupé le son »** apparaît : touche-le pour le réactiver.
- **Rappel sonore** toutes les minutes tant qu'une commande reste « Nouvelle » (touche
  **En préparation** pour l'arrêter) ou qu'un appel n'est pas marqué **✓ Fait**
  (réglable : `REMINDER_INTERVAL` dans `src/components/bar/BarScreen.tsx`). Les sons
  sont dans `public/sons/` (à refaire avec `node scripts/generer-sons.mjs`).
- Tablette : **verrouillage automatique → Jamais**, volume au maximum ; « Partager →
  Sur l'écran d'accueil » pour l'ouvrir en plein écran comme une application.
- Les commandes arrivent **sans recharger** (« ● En direct »), avec un signal sonore.
  Si le temps réel est coupé, l'écran se relit tout seul toutes les 20 s
  (« ○ Actualisation auto »).
- Seules les commandes **payées en ligne** ou **« Payer au serveur »** apparaissent :
  un paiement en ligne non terminé n'arrive jamais au bar.
- **En préparation → ✓ Servie**, **Encaissé** (commandes « À encaisser »),
  **Annuler** (commandes non payées), retour arrière possible.
- La carte devient **orange après 5 min** d'attente, **rouge après 10 min**
  (réglable dans `src/components/bar/OrderCard.tsx`).
- **Historique du jour** : commandes servies ou annulées (une journée va de 5 h à 5 h).
- **Appels des tables** : quand un client touche « Appeler un serveur » (violet) ou
  « L'addition » (bleu), un bandeau s'affiche en haut avec un son différent de celui des
  commandes. **✓ Fait** l'enlève. Un appel non traité disparaît seul au bout d'1 heure.
- **⏸️ Pause des commandes** (rush, cuisine fermée, fermeture) : les clients voient
  « Commandes en pause » et ne peuvent plus commander depuis le téléphone ; ils peuvent
  toujours consulter la carte et appeler un serveur. Bandeau rouge sur la tablette tant que
  la pause est active ; **▶ Reprendre les commandes** pour rouvrir. Le personnel et le
  gérant peuvent l'activer.
- **Pourboire** : proposé avec le paiement en ligne (Sans, 5 %, 10 % ou montant libre,
  au plus le montant de la commande) ; affiché « 🙏 Pourboire » sur la commande.

### L'espace gérant (`/admin`, compte gérant uniquement)

- **Commandes du jour** : chiffre d'affaires, nombre de commandes, payé en ligne,
  encaissé au bar, reste à encaisser, pourboires (en plus du chiffre d'affaires) ;
  jours précédents.
- **⏸️ Pause des commandes** en haut de chaque page, comme sur l'écran du bar.
- **Carte** : catégories et produits (nom, description, prix, photo, ordre),
  interrupteur **Disponible / Épuisé** immédiat chez les clients. Les photos sont
  réduites à 800 px avant l'envoi (chargement rapide en 4G).
- **Tables & cartes NFC** : lien à copier, QR code, **Renommer** (sans reprogrammer),
  **Désactiver**, **Nouveau lien**, **Supprimer**, planche de QR codes à imprimer.
- **Réglages** : nom du bar, logo, « Payer au serveur » et « Paiement en ligne ».

Les boutons réagissent immédiatement ; l'enregistrement se fait en arrière-plan
(« Enregistrement… » puis « ✓ À jour »). En cas d'échec, un message s'affiche et
l'écran revient à l'état réel.

---

## 6. Sécurité

**Ce que fait l'application**
- **Les téléphones des clients n'ont aucun accès direct à la base** : tout passe par le
  serveur, qui appelle des fonctions SQL vérifiant le lien de table, la disponibilité
  et l'appartenance des produits au bar.
- **Les prix sont recalculés par la base** ; le prix envoyé par le téléphone est ignoré.
- **Row Level Security** sur toutes les tables : le personnel ne voit que son bar, seul
  le gérant modifie carte, tables et réglages. Chaque fonction de l'espace gérant
  revérifie le rôle de gérant.
- **Paiement** : commande « en attente de paiement », invisible au bar, jusqu'au message
  **signé** de Stripe (webhook) et la vérification du montant. Messages en double sans
  effet. Paiement abandonné : annulé après 30 minutes.
- **Anti-abus** : 5 commandes maximum par table toutes les 2 minutes (réglable dans
  `supabase/5-ajouts.sql`, fonction `create_order`), 20 exemplaires par produit,
  50 articles par commande ; 10 appels du serveur maximum par table toutes les
  10 minutes, un seul appel du même type en attente. Pourboire vérifié par la base
  (paiement en ligne uniquement, au plus le montant de la commande et 100 €).
- **Pause des commandes** vérifiée par la base : une commande envoyée pendant la pause
  est refusée, même si la page du client n'est pas à jour.
- **Liens de table** : 12 caractères aléatoires (générateur cryptographique), pages
  exclues des moteurs de recherche.
- **Clés secrètes** uniquement dans les variables Vercel, jamais dans le code ni dans
  ce qui est envoyé aux téléphones (vérifié).
- **En-têtes de sécurité** : politique de contenu (CSP : scripts du site uniquement,
  connexions limitées au site et à Supabase), interdiction d'afficher le site dans une
  autre page, etc. (`next.config.ts`). Si tu ajoutes un outil externe (statistiques,
  chat…), il faudra l'autoriser dans ce fichier.

**Ce que tu dois faire**
- Supabase : désactiver **Allow new users to sign up** (voir 4.1, étape 7).
- Des mots de passe solides et différents pour chaque compte ; double authentification
  (application, pas SMS) sur GitHub, Vercel, Supabase et Stripe.
- Ne jamais coller une clé secrète dans une conversation, un email ou le code.
- Verrouiller les puces NFC une fois posées dans un vrai bar (NFC Tools → *Autres →
  Verrouiller le tag*, irréversible) pour que personne ne puisse les réécrire.
- Passer le dépôt GitHub en **privé** avant de vendre (le code du produit est visible
  aujourd'hui ; aucune clé n'y figure).

---

## 7. Dépannage

| Message ou symptôme | Solution |
|---|---|
| « Configuration incomplète » | Une variable manque dans Vercel → ajoute-la puis **Redeploy**. |
| « La clé Supabase est refusée » | `SUPABASE_SECRET_KEY` mal copiée. |
| « Accès refusé par la base » | La publishable key a été mise à la place de la secret key. |
| « La base n'est pas installée » | Exécute `supabase/1-structure.sql`. |
| « Supabase est injoignable » / « Cette adresse Supabase n'existe pas » | `NEXT_PUBLIC_SUPABASE_URL` incorrecte ou en type *Secret* au lieu de *Config*, ou projet Supabase en pause (réactive-le sur supabase.com). Puis redéploie. |
| « Carte non reconnue » | Lien incomplet, table désactivée ou lien régénéré. |
| « Base incomplète : exécutez les scripts… » | Exécute `supabase/4-etape-4.sql` puis `supabase/5-ajouts.sql` dans Supabase. |
| Après une mise à jour, plus aucune commande ne passe (« Petit souci technique ») ou l'écran du bar reste vide | Le dernier script SQL n'a pas été exécuté : lance `supabase/5-ajouts.sql` dans Supabase. Vercel → Logs : « Could not find the function ». |
| « Envoi impossible » en ajoutant une photo | Stockage des images absent : relance la fin de `1-structure.sql` ou crée un bucket public `images` dans Supabase → Storage. |
| « Payer maintenant » n'apparaît pas | `STRIPE_SECRET_KEY` ou `STRIPE_WEBHOOK_SECRET` manquante, ou pas redéployé. |
| Paiement accepté mais rien au bar (« Paiement en cours… » qui dure) | Webhook : Stripe → Webhooks → ta destination → envois en échec. Vérifie l'URL `…/api/stripe/webhook` et le secret `whsec_…` de **cette** destination. Vercel → Logs : « Webhook Stripe refusé ». |
| « Le paiement en ligne est momentanément indisponible » | Clé Stripe incorrecte, ou clé restreinte sans « Checkout Sessions : écriture ». |
| Pas de son à l'écran du bar | Touche « Activer le son » : un « ding-dong » doit retentir. Sinon, monte le volume **pendant** le son (volume « média », pas celui de la sonnerie) et vérifie qu'aucune enceinte ou écouteur Bluetooth n'est connecté. L'écran du bar doit rester **affiché au premier plan** : un onglet en arrière-plan ou un téléphone verrouillé ne sonne pas. |
| « ○ Actualisation auto » au lieu de « ● En direct » | Les commandes arrivent quand même (20 s max). Recharge la page ; vérifie la connexion internet de la tablette. |

Le détail des erreurs serveur est dans Vercel → ton projet → **Logs**.

---

## 8. Modifier l'application

**Avec Claude** : décris le changement en français (« ajoute une catégorie Desserts à
la démo », « l'alerte rouge à 15 minutes »…). Claude modifie le code sur la branche de
travail ; tu valides sur GitHub (**Create pull request → Merge**) et Vercel met en ligne.

**Sur ton ordinateur** (facultatif, nécessite Node.js 20.9+) :

```bash
cd commande-bar
cp .env.example .env.local   # puis remplis les valeurs
npm install
npm run dev                  # http://localhost:3000
npm run lint && npm run typecheck && npm run build
```

Organisation du code :

| Dossier | Contenu |
|---|---|
| `src/app/t/` | Pages client (carte, suivi de commande) |
| `src/app/bar/`, `src/components/bar/` | Écran du bar |
| `src/app/admin/`, `src/components/admin/` | Espace gérant |
| `src/app/api/` | Commandes, webhook Stripe, QR codes |
| `src/lib/` | Accès Supabase et Stripe, types, formatage, configuration |
| `supabase/` | Scripts SQL : structure et sécurité (1), démo (2), écran du bar (3), espace gérant (4), appels / pourboire / pause (5) |

---

## 9. Ajouter un nouveau bar

Chaque bar est totalement isolé des autres (tables, carte, commandes, personnel).

1. Supabase → **Authentication → Users → Add user** : compte du gérant (Auto Confirm),
   et éventuellement un compte pour le personnel.
2. **SQL Editor** :

```sql
insert into public.venues (slug, name) values ('nom-du-bar', 'Nom du bar');

insert into public.venue_members (venue_id, user_id, role)
select v.id, u.id, 'owner'                      -- 'staff' pour le personnel
from public.venues v, auth.users u
where v.slug = 'nom-du-bar' and u.email = 'gerant@nom-du-bar.fr';
```

3. Le gérant se connecte sur `/admin` et crée sa carte et ses tables, puis programme
   ses cartes NFC.

---

## 10. Avant de vendre à un vrai bar

- [ ] **Nom de domaine** à toi (≈ 10 €/an), branché dans Vercel (*Settings → Domains*)
      et renseigné dans `SITE_URL`, **avant** de programmer les cartes.
- [ ] **Vercel Pro** (l'offre gratuite est réservée à l'usage non commercial) et
      **Supabase Pro** (pas de mise en pause, sauvegardes).
- [ ] **Stripe en mode réel** : activation du compte, nouvelles clés `rk_live_…` et
      nouveau webhook en mode réel. Pour que chaque bar encaisse directement :
      **Stripe Connect**, modèle « SaaS avec paiements » (un compte Stripe par bar,
      paiements au nom du bar, commission possible pour Tapigo). La base est prête
      (colonne `venues.stripe_account_id`).
- [ ] Dépôt GitHub **privé**.
- [ ] Puces NFC **verrouillées** une fois posées.
- [ ] Mentions légales, CGV/CGU et politique de confidentialité (RGPD) sur le site.
- [ ] Pourboires : vérifier avec le comptable du bar comment les reverser à l'équipe
      (ils sont encaissés avec la commande).
- [ ] Tester le scénario de démonstration sur place, avec le wifi / la 4G du bar.
