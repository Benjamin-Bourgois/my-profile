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
| `/t/<lien-secret>` | Le client (adresse écrite dans la puce NFC / le QR code) | Nom du bar, « Table X », carte par catégories, produits épuisés grisés, panier avec suggestions « Souvent pris avec », commentaire, paiement en ligne ou au serveur (espèces, carte ou les deux), pourboire, boutons « Appeler un serveur » / « L'addition », mention sur l'alcool |
| `/t/<lien-secret>/commande/<n°>` | Le client | Numéro de commande, statut mis à jour toutes les 3 s (Reçue → En préparation → Servie), « Une autre tournée ? » un quart d'heure après le service, « Commander à nouveau », appel du serveur |
| `/t/<lien-secret>/paiement-demo/<n°>` | Le client d'un bar marqué « Démo » | Page de paiement simulée (aucun argent débité), tant que Stripe n'est pas connecté |
| `/bar` | Le personnel (tablette) | Commandes et appels des tables en temps réel avec signal sonore, numéro de table en très grand, boutons En préparation / Servie / Encaissé, pause des commandes |
| `/bar/commande` | Les serveurs (téléphone ou tablette) | Prise de commande pour un client : table ou comptoir, articles, commentaire, « À encaisser » ou « Déjà encaissé », espèces ou carte |
| `/stocks` | Le personnel et le gérant | Stock de chaque article, alertes, livraisons, pertes, inventaires, historique, **bon de livraison lu par l'IA à partir d'une photo** ; le gérant crée les articles |
| `/admin` | Le gérant | Commandes du jour et totaux (dont pourboires), carte, tables et cartes NFC, QR codes, réglages, pause des commandes |
| `/agence` | L'agence (Tapigo) | Tous les bars : création, comptes et mots de passe, suspension de l'abonnement, accès à l'espace gérant et à l'écran de chaque bar ; lecture des bons par l'IA (activation, coût par bar) |
| `/connexion` | Personnel et gérant | Email + mot de passe |
| `/` | Prospects | Page de présentation |

### Les briques

| Brique | Rôle | Prix pour démarrer |
|---|---|---|
| **Next.js 16** (dossier `src/`) | Le site | gratuit |
| **Supabase** | Base de données, comptes du personnel, temps réel, photos | gratuit (pause après 7 jours sans visite : un clic pour réveiller) |
| **Vercel** | Mise en ligne automatique à chaque mise à jour sur GitHub | gratuit (non commercial) |
| **Stripe** | Paiement carte / Apple Pay / Google Pay | gratuit en test, commission sur les vrais paiements |
| **Claude (Anthropic)** *(facultatif)* | Lecture des bons de livraison en photo | payé à l'usage : quelques centimes par bon (environ 0,05 à 0,15 € par page) |

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
   Sans Stripe, dans un bar marqué **« Démo »** (espace agence) : une page de paiement
   **simulée** s'affiche (aucun argent débité) → **Payer** ; la suite est identique, avec
   « Payé en ligne · démo ».
   (Variante : **« Payer au serveur »** puis **Espèces**, **Carte** ou **Les deux** : la
   commande arrive « À encaisser · Carte », le serveur sait quoi apporter.)
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
9. **Le serveur prend une commande** — Sur la tablette, **« + Nouvelle commande »** :
   Table 4, deux Mojitos, « Déjà encaissé » → **Envoyer au bar**. La commande arrive
   avec le badge « Serveur ».
10. **Les stocks** — **« Stocks »** : le rhum, les citrons et la menthe ont baissé tout
    seuls. Note une **Livraison** de menthe. Les Olives (stock à 0) sont « Épuisé » sur
    la carte du client.
11. **Le bon de livraison en photo** *(si la clé Claude est installée, voir 4.5)* —
    **« Scanner un bon »**, photo d'une facture de fournisseur → **Lire le bon** : en
    quelques secondes chaque produit est retrouvé dans le stock, les quantités converties
    (« 6 bouteilles × 70 cl = 420 cl »), les lignes douteuses signalées « À vérifier ».
    Corrige une quantité, puis **Ajouter au stock** : tout est enregistré en une fois.
12. **Les suggestions** — Sur le téléphone, mets une **Pinte** dans le panier : « Souvent
    pris avec » propose une planche ; **Ajouter** en un geste. Puis montre au patron la
    carte noire **« Ce que l'application vous a rapporté »** en haut des **Statistiques** :
    c'est l'argument qui fait signer.

**Pour finir, l'espace gérant** (`/admin`)
- Passe un produit en **Épuisé** : il est grisé sur le téléphone.
- Renomme la table de la carte : le nouveau nom s'affiche, **sans reprogrammer la carte**.
- Montre les **Commandes du jour** et le chiffre d'affaires, puis les **Statistiques**
  (heures de pointe, meilleures ventes, tables, rapidité du service) et la **planche de QR codes**.

**Statistiques remplies pour la démo** : un bar qui démarre n'a pas encore d'historique.
Pour montrer des statistiques parlantes, exécute une fois
[`supabase/demo-historique.sql`](supabase/demo-historique.sql) dans Supabase (SQL Editor) :
6 mois d'activité fictive mais réaliste pour **« Le Comptoir de Démo » uniquement**
(soirées plus chargées le week-end, fermé le lundi, clientèle en hausse, pourboires,
appels des tables, planches commandées avec la bière, et — si le script 10 est en
place — les ventes dues aux suggestions des 3 derniers mois, pour le compteur
« Ce que l'application vous a rapporté »). Les vraies commandes et les autres bars ne sont pas touchés ; on peut
le relancer à tout moment (l'historique fictif est remplacé, toujours jusqu'à la veille).
Pour l'effacer : [`supabase/demo-historique-effacer.sql`](supabase/demo-historique-effacer.sql).

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
   [`supabase/5-ajouts.sql`](supabase/5-ajouts.sql) (appel du serveur, pourboire, pause),
   [`supabase/6-statistiques.sql`](supabase/6-statistiques.sql) (statistiques du gérant) et
   [`supabase/7-stocks-et-commandes-serveur.sql`](supabase/7-stocks-et-commandes-serveur.sql)
   (stocks, commandes prises par les serveurs), et
   [`supabase/8-bons-de-livraison.sql`](supabase/8-bons-de-livraison.sql)
   (bons de livraison lus par l'IA, espace agence) et
   [`supabase/9-gestion-des-bars.sql`](supabase/9-gestion-des-bars.sql)
   (gestion des bars par l'agence, suspension) et
   [`supabase/10-suggestions.sql`](supabase/10-suggestions.sql)
   (suggestions aux clients, ventes générées par l'application) et
   [`supabase/11-reglement-au-serveur.sql`](supabase/11-reglement-au-serveur.sql)
   (règlement au serveur : espèces, carte ou les deux) et
   [`supabase/12-paiement-demo.sql`](supabase/12-paiement-demo.sql)
   (paiement en ligne simulé pour les bars de démonstration).
   Les scripts 3 à 12 peuvent être relancés sans risque (dans l'ordre : après avoir
   relancé un script, relance aussi les suivants).
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
   | `ANTHROPIC_API_KEY` *(facultatif)* | clé Claude pour lire les bons de livraison (voir 4.5) | **Secret** |
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

**En attendant Stripe** : marque ton bar de démonstration **« Démo »** (espace agence →
le bar → **Démonstration** → **Activer la démonstration**). Ses clients voient quand
même **« Payer maintenant »** : une page de paiement simulée s'ouvre (« aucun argent
n'est débité »), puis la commande arrive au bar **« Payé en ligne · démo »**. Le bar
« Le Comptoir de Démo » est marqué « Démo » d'office. Dès que les clés Stripe sont dans
Vercel, tous les paiements en ligne passent par Stripe, y compris dans les bars « Démo ».

### 4.5 Claude (lecture des bons de livraison, facultatif)

**Une seule clé, celle de l'agence, pour tous les bars** : les bars n'ont aucun compte à
créer, et c'est l'agence qui paie l'usage. Sans cette clé, tout fonctionne ; le bouton
**« Scanner un bon »** n'apparaît simplement pas dans la page Stocks des bars.

1. Crée un compte sur la console d'Anthropic : <https://platform.claude.com>.
2. **Billing** : ajoute une carte et achète un petit crédit (par exemple 10 $ : plusieurs
   centaines de bons). Dans les réglages des **limites**, fixe une dépense maximale par
   mois (par exemple 20 $) : jamais de mauvaise surprise.
3. **API Keys → Create Key**, nom `commande-bar` → copie la clé `sk-ant-…` (elle ne
   s'affiche qu'une fois). ⚠️ Ne la colle nulle part ailleurs que dans Vercel.
4. Vercel → **Settings → Environment Variables** → `ANTHROPIC_API_KEY` = la clé, type
   **Secret** → **Save**, puis **Deployments → ⋯ → Redeploy**.
5. Page **Stocks** : le bouton **« Scanner un bon »** apparaît pour toute l'équipe de
   chaque bar. L'**espace agence** (4.6) affiche « Activée ».

Coût : quelques centimes par bon (environ 0,05 à 0,15 € par page), payés à Anthropic.
Pour éviter les abus : 8 lectures par personne toutes les 10 minutes et 40 par bar et
par jour au maximum (réglable dans `supabase/8-bons-de-livraison.sql`).

### 4.6 L'espace agence (`/agence`)

Ton poste de pilotage : un compte agence a accès à **tous les bars** (voir 5, « L'espace
agence »). Pour créer ton compte agence :

1. Supabase → **Authentication → Users → Add user** : ton email d'agence et un mot de
   passe, coche **Auto Confirm User**.
2. **SQL Editor → New query** (remplace l'email par le tien) → **Run** :

```sql
insert into private.platform_admins (user_id)
select id from auth.users where email = 'ton-email@agence.fr'
on conflict do nothing;
```

3. Connecte-toi sur `/connexion` avec ce compte : tu arrives sur l'**Espace agence**
   (ou ouvre directement `/agence`).

Pour retirer un compte agence : `delete from private.platform_admins where user_id =
(select id from auth.users where email = '…');`.

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
- **Règlement au serveur** : le client qui choisit « Payer au serveur » indique
  **Espèces**, **Carte** ou **Les deux** ; la commande arrive avec le badge
  « À encaisser · Carte » (ou « · Espèces », « · Espèces + carte ») : le serveur sait
  s'il doit apporter le terminal de paiement ou la monnaie.
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
- **+ Nouvelle commande** : un serveur prend la commande d'un client (sur la tablette ou
  sur son téléphone, en ouvrant `/bar/commande` avec le compte du personnel) : il choisit
  la table (ou « Comptoir »), les articles, ajoute un commentaire et indique si c'est
  **À encaisser** ou **Déjà encaissé**, et s'il le souhaite **Espèces**, **Carte** ou
  **Les deux** (facultatif). La commande arrive sur l'écran du bar avec le
  badge « Serveur ». Possible même quand les commandes des clients sont en pause ; le
  stock restant est affiché pour chaque produit.

### Les stocks (`/stocks`, personnel et gérant)

- Un **article de stock** est ce que le bar achète : un fût de bière (en litres), une
  bouteille de rhum (en cl), des citrons (à l'unité), des portions de fromage…
- Chaque produit de la carte peut **consommer** un ou plusieurs articles (Espace gérant →
  Carte → Modifier → **Stock**) : un Mojito = 5 cl de rhum + 1 citron vert + 1 portion de
  menthe ; une Pinte = 0,5 L de bière blonde.
- **Décompte automatique** : à chaque commande (client ou serveur), le stock baisse ; il
  remonte si la commande est annulée (par le bar, ou paiement en ligne abandonné). S'il
  n'en reste plus assez, le produit passe **« Épuisé »** tout seul sur la carte des
  clients ; quand il n'en reste que 5 ou moins, le client voit **« Plus que 3 »** et ne
  peut pas en commander davantage.
- **Toute l'équipe** peut saisir une **Livraison** (+), une **Perte / casse** (−) ou un
  **Inventaire** (la quantité comptée remplace le stock) ; chaque mouvement est noté
  dans l'**Historique** (qui, quand, pourquoi, n° de commande).
- **Alertes** : un seuil par article ; les articles sous le seuil apparaissent dans
  « À commander », et l'écran du bar affiche leur nombre sur le bouton « Stocks ».
  « Environ N jours de stock » est estimé d'après les ventes des 7 derniers jours.
- **Le gérant** crée, modifie et supprime les articles (bouton **Nouvel article**,
  crayon ✏️). Le bar de démo est livré avec 16 articles déjà reliés à la carte.

### Scanner un bon de livraison (`/stocks` → « Scanner un bon »)

1. **Prendre une photo** du bon ou de la facture (une photo par page, 4 au maximum), ou
   **Choisir une photo ou un PDF** (la facture reçue par e-mail).
2. **Lire le bon** : en 15 à 40 secondes, l'IA relève chaque produit livré, retrouve
   l'article du stock correspondant et convertit la quantité dans son unité
   (6 bouteilles de 70 cl → 420 cl ; 1 carton de 24 → 24 canettes). Elle ignore les
   consignes, remises, frais de port et totaux.
3. **Vérifier** : chaque ligne montre ce qui est écrit sur le bon, l'article proposé, la
   quantité, le calcul et le stock obtenu. Les lignes **« À vérifier »** (conversion
   incertaine, chiffre douteux, produit non trouvé) sont encadrées : corrige la
   quantité ou l'article, ou choisis **« Ne pas ajouter »** (serviettes, produits
   d'entretien…).
4. **Ajouter au stock** : toute la livraison est enregistrée en une fois, dans
   l'historique de chaque article (« 📸 Bon de livraison · DistriBoissons · n° F-123 »). Un même
   bon ne peut pas être enregistré deux fois.

Conseils : document à plat, bien éclairé, en entier dans la photo. Un produit souvent
« non trouvé » ? Le gérant le crée avec **Nouvel article**, il sera reconnu la fois
suivante. Rien ne change dans le stock tant que personne n'a appuyé sur **Ajouter au stock**.

### L'espace agence (`/agence`, comptes agence uniquement)

- **Bars et accès** : tous les bars avec leur état (Actif, En pause, Suspendu), leur
  gérant, leurs commandes et leur chiffre d'affaires des 30 derniers jours.
- **Nouveau bar** : le nom du bar et, si tu veux, l'email de son gérant. Le compte est
  créé avec un **mot de passe provisoire** (proposé, modifiable) ; les identifiants
  s'affichent une seule fois avec un bouton **Copier**, prêts à envoyer au client.
- **Fiche d'un bar** (« Accès et abonnement ») :
  - **Ouvrir ce bar** : **Espace gérant**, **Écran du bar** ou **Stocks**, exactement
    comme le gérant (carte, tables, cartes NFC, réglages…). Un bandeau noir « Espace
    agence » permet de revenir ; un menu en haut de l'espace gérant change de bar.
  - **Accès** : chaque compte avec son rôle (**Gérant** : tout le bar ; **Équipe** :
    écran du bar, prise de commande, stocks) et sa dernière connexion. Changer le rôle,
    **Nouveau mot de passe** (affiché une fois), **Retirer l'accès**. **Donner un
    accès** : nouvel email (compte créé) ou email existant (il garde son mot de passe).
  - **Démonstration** : **Activer la démonstration** pour un bar qui sert à montrer
    l'application (badge doré « Démo ») : sans Stripe, ses clients peuvent « Payer
    maintenant » sur une page simulée, sans être débités. ⚠️ Jamais pour un vrai bar :
    un client pourrait se faire servir sans payer. Désactiver annule les paiements
    simulés en cours.
  - **Abonnement** : **Suspendre le bar** (avec une raison, visible par toi seul) quand
    un client arrête son abonnement ou ne paie plus ; **Réactiver le bar** pour tout
    rétablir.
- **Ce que fait la suspension** : les clients qui scannent une table voient « Service
  indisponible » et ne peuvent plus commander ni appeler ; l'équipe et le gérant voient
  « Accès suspendu, contactez Tapigo » sur l'écran du bar, l'espace gérant et les
  stocks. **Toutes les données sont conservées** et toi tu gardes l'accès complet.
- **Lecture des bons (IA)** : activation de l'IA et, mois par mois, lectures et coût
  estimé par bar (estimation d'après le tarif de Claude ; la facture d'Anthropic fait foi).

Les clients ne peuvent pas changer eux-mêmes leur mot de passe : s'ils l'oublient,
donne-leur-en un nouveau depuis leur fiche.

### Les suggestions : des ventes en plus, chiffrées

- **« Souvent pris avec »** : dans le panier, le client voit 2 produits à ajouter en un
  geste. Ils viennent des **vraies ventes du bar** (ce qui se commande ensemble ; une
  bière appelle plutôt une planche qu'une autre bière). Le gérant peut imposer ses choix
  pour un produit : Carte → Modifier → **Suggérer avec ce produit** (3 au plus, par
  exemple pour pousser un cocktail maison). Un bar qui démarre, sans historique, se voit
  proposer ses meilleures ventes d'une autre catégorie. Jamais de produit épuisé.
- **« Une autre tournée ? »** : un quart d'heure après le service, la page de suivi
  propose de reprendre la même chose ; le panier s'ouvre déjà rempli, le client vérifie
  et envoie.
- **Le compteur** : chaque article ajouté depuis une suggestion est noté. Le gérant voit
  **« Ce que l'application vous a rapporté »** en haut des **Statistiques** (montant, part
  du chiffre d'affaires, détail par type de suggestion) et un bandeau sur l'accueil
  (« Ce mois-ci, l'application vous a rapporté … »). L'agence voit le même chiffre pour
  chaque bar dans son espace. Seules les commandes servies ou payées comptent.
- **Réglages → Suggestions aux clients** : un interrupteur pour tout désactiver.

### L'espace gérant (`/admin`, compte gérant uniquement)

- **Commandes du jour** : chiffre d'affaires, nombre de commandes, payé en ligne,
  encaissé au bar, reste à encaisser, pourboires (en plus du chiffre d'affaires),
  répartition du règlement au serveur (« Au serveur : Espèces … · Carte … ») ;
  jours précédents.
- **Statistiques** sur 7 jours, 30 jours, 90 jours, 12 mois ou les dates de ton choix,
  comparées à la période précédente de même durée :
  - chiffre d'affaires, commandes, panier moyen, articles vendus, pourboires, temps de
    service moyen (avec l'évolution en %) ;
  - points clés : jour le plus rentable, heure de pointe, produit star, table la plus
    rentable, chiffre d'affaires par jour d'ouverture ;
  - chiffre d'affaires par jour (par semaine sur 90 jours, par mois sur 12 mois) ;
  - affluence par heure, par jour de la semaine, et carte de chaleur jour × heure ;
  - meilleures ventes, part de chaque catégorie, produits jamais commandés ;
  - classement des tables, répartition payé en ligne / au bar, pourboires ;
  - rapidité du service (moyenne, médiane, % servies en moins de 10 min, prise en
    charge) et appels des tables (nombre, temps de réponse) ;
  - **Exporter les commandes (CSV)** de la période, à ouvrir dans Excel ou à envoyer au
    comptable (séparateur « ; », montants avec virgule, colonne « Règlement au
    serveur » : espèces, carte ou les deux).

  Survole (ou touche) une barre pour voir le détail ; « Voir les chiffres » sous chaque
  graphique affiche le tableau complet. Les commandes annulées et les paiements en ligne
  abandonnés ne sont pas comptés ; un temps de service de plus de 3 h (oubli de clic
  « Servie ») est ignoré.
- **⏸️ Pause des commandes** en haut de chaque page, comme sur l'écran du bar.
- **Carte** : catégories et produits (nom, description, prix, photo, ordre),
  interrupteur **Disponible / Épuisé** immédiat chez les clients. Les photos sont
  réduites à 800 px avant l'envoi (chargement rapide en 4G).
- **Tables & cartes NFC** : lien à copier, QR code, **Renommer** (sans reprogrammer),
  **Désactiver**, **Nouveau lien**, **Supprimer**, planche de QR codes à imprimer.
- **Réglages** : nom du bar, logo, « Payer au serveur » (avec **Espèces** et **Carte
  bancaire** : décoche celui que le bar n'accepte pas, il disparaît chez les clients ;
  au moins un des deux reste coché) et « Paiement en ligne ».

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
- **Paiement simulé** (bars « Démo ») : seul un compte agence peut marquer un bar
  « Démo » ; ailleurs, aucune commande ne peut être payée ainsi (vérifié par la base).
  Il ne sert que tant que Stripe n'est pas connecté, et les commandes concernées restent
  marquées « démo » (écran du bar, suivi, export).
- **Règlement au serveur** vérifié par la base : le client ne peut choisir qu'un moyen
  accepté par le bar, une seule fois, juste après sa commande ; seul le personnel du
  bar peut le corriger ensuite.
- **Pause des commandes** vérifiée par la base : une commande envoyée pendant la pause
  est refusée, même si la page du client n'est pas à jour.
- **Stocks** décomptés par la base, dans la même opération que la commande : deux clients
  qui commandent en même temps les dernières bouteilles ne peuvent pas en obtenir plus
  qu'il n'en reste (la deuxième commande est refusée avec un message clair). Le
  personnel saisit les mouvements ; seul le gérant crée ou supprime des articles.
- **Commandes des serveurs** : réservées aux comptes du personnel du bar, prix toujours
  recalculés par la base, auteur enregistré.
- **Bons de livraison lus par l'IA** : réservé au personnel connecté. La photo est
  envoyée à Claude (Anthropic) uniquement pour la lecture ; l'application ne la
  conserve pas. L'IA ne fait que **proposer** : rien ne change dans le stock avant la
  validation par une personne, et la base revérifie chaque ligne (article de ce bar,
  quantité raisonnable) et refuse d'enregistrer deux fois le même bon. Le texte du
  document est traité comme une donnée, jamais comme une instruction. Seules les
  vraies photos et les PDF sont acceptés (4 Mo au maximum), avec des limites d'usage
  (8 lectures par personne en 10 minutes, 40 par bar et par jour).
- **Comptes agence** : déclarés dans une table privée de la base, inaccessible depuis le
  site. Ils ont accès à tous les bars ; chaque action de l'espace agence est revérifiée
  par la base. La création des comptes et les mots de passe passent par le serveur
  (clé secrète Supabase), jamais par le navigateur ; un mot de passe n'est affiché
  qu'une fois et l'espace agence ne peut pas modifier un autre compte agence.
- **Suggestions** : calculées par la base à partir des ventes du bar uniquement ; les ventes
  « grâce à l'appli » sont enregistrées par le serveur juste après la commande (10 minutes
  au plus), seulement pour des produits réellement présents dans cette commande, avec
  leur vrai prix.
- **Suspension** appliquée par la base elle-même : plus aucune commande ni aucun appel
  n'est accepté pour un bar suspendu (quel que soit le chemin), et son équipe perd
  l'accès à toutes ses données. Seule l'agence peut suspendre ou réactiver.
- **Liens de table** : 12 caractères aléatoires (générateur cryptographique), pages
  exclues des moteurs de recherche.
- **Clés secrètes** (Supabase, Stripe, Anthropic) uniquement dans les variables Vercel,
  jamais dans le code ni dans ce qui est envoyé aux téléphones (vérifié).
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
| « Base incomplète : exécutez… » | Exécute dans Supabase le dernier script du dossier `supabase/` (et les précédents s'ils manquent). |
| Page **Statistiques** : « Base incomplète », ou l'export CSV renvoie « Export impossible » | Exécute `supabase/6-statistiques.sql` dans Supabase. |
| Pages **Stocks** ou **Nouvelle commande** : « Base incomplète » | Exécute `supabase/7-stocks-et-commandes-serveur.sql` dans Supabase. |
| Le bouton **Scanner un bon** n'apparaît pas | Normal tant que `ANTHROPIC_API_KEY` n'est pas dans Vercel (voir 4.5, puis **Redeploy**). L'espace agence indique « Pas encore activée ». Le bouton n'apparaît pas non plus dans un bar qui n'a encore aucun article de stock. |
| **Espace agence** : « Réservé à l'agence » | Le compte n'est pas déclaré comme compte agence : voir 4.6, étape 2. |
| **Espace agence** : « Base incomplète » | Exécute `supabase/8-bons-de-livraison.sql` puis `supabase/9-gestion-des-bars.sql` dans Supabase. |
| Un client voit « Service indisponible », ou l'équipe « Accès suspendu » | Le bar est suspendu : Espace agence → le bar → **Réactiver le bar**. |
| Pas de « Souvent pris avec » dans le panier | Exécute `supabase/10-suggestions.sql` ; vérifie **Réglages → Suggestions aux clients** ; il faut au moins un autre produit disponible à proposer. |
| Pas de carte « Ce que l'application vous a rapporté » dans les Statistiques | Exécute `supabase/10-suggestions.sql`. Le montant se remplit au fil des commandes passées avec une suggestion. |
| Le client ne voit pas « Espèces / Carte / Les deux », ou les Réglages affichent « Base incomplète » | Exécute `supabase/11-reglement-au-serveur.sql` dans Supabase. |
| Le bouton du panier reste sur « Choisissez espèces ou carte » | Normal : le client doit toucher **Espèces**, **Carte** ou **Les deux** avant d'envoyer une commande payée au serveur. |
| Un client a oublié son mot de passe | Espace agence → le bar → **Nouveau mot de passe** sur son compte, puis envoie-le-lui. |
| **Scanner un bon** : « La clé ANTHROPIC_API_KEY est refusée » | Clé mal copiée ou supprimée : crée-en une nouvelle sur platform.claude.com, remplace-la dans Vercel, redéploie. |
| **Scanner un bon** : « vérifiez le crédit du compte Anthropic » | Crédit épuisé ou limite mensuelle atteinte : platform.claude.com → **Billing**. |
| **Scanner un bon** : « Base incomplète » | Exécute `supabase/8-bons-de-livraison.sql` dans Supabase. |
| **Scanner un bon** : lecture fausse ou incomplète | Reprends la photo plus nette, à plat, une page par photo ; corrige les lignes avant d'ajouter au stock. |
| Le déploiement Vercel échoue en parlant de `maxDuration` | Vercel → **Settings → Functions** : active **Fluid Compute** (la lecture d'un bon peut durer plus de 60 s). |
| Un produit est « Épuisé » alors qu'il en reste | Son stock (ou celui d'un de ses ingrédients) est à 0 dans **Stocks** : fais un **Inventaire** ou une **Livraison**. |
| Après une mise à jour, plus aucune commande ne passe (« Petit souci technique ») ou l'écran du bar reste vide | Le dernier script SQL n'a pas été exécuté : lance le dernier script du dossier `supabase/` dans Supabase. Vercel → Logs : « Could not find the function ». |
| « Envoi impossible » en ajoutant une photo | Stockage des images absent : relance la fin de `1-structure.sql` ou crée un bucket public `images` dans Supabase → Storage. |
| « Payer maintenant » n'apparaît pas | `STRIPE_SECRET_KEY` ou `STRIPE_WEBHOOK_SECRET` manquante, ou pas redéployé. En attendant Stripe : marque le bar « Démo » dans l'espace agence (script `supabase/12-paiement-demo.sql` exécuté), et vérifie **Réglages → Paiement en ligne**. |
| **Espace agence**, carte « Démonstration » : « Exécutez … 12-paiement-demo.sql » | Exécute `supabase/12-paiement-demo.sql` dans Supabase. |
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
| `src/app/bar/commande/`, `src/components/staff/` | Prise de commande par un serveur |
| `src/app/stocks/`, `src/components/stock/` | Stocks |
| `src/app/agence/`, `src/components/agency/` | Espace agence (bars, accès, suspension, IA) |
| `src/app/api/` | Commandes, webhook Stripe, QR codes, lecture des bons (`stocks/scan`) |
| `src/lib/` | Accès Supabase, Stripe et Claude (`delivery-scan-ai.ts`), suggestions (`suggestions.ts`), types, formatage, configuration |
| `supabase/` | Scripts SQL : structure et sécurité (1), démo (2), écran du bar (3), espace gérant (4), appels / pourboire / pause (5), statistiques (6), stocks et commandes des serveurs (7), bons de livraison et espace agence (8), gestion des bars et suspension (9), suggestions et ventes générées (10), règlement au serveur en espèces ou carte (11), paiement en ligne de démonstration (12) |

**Charte graphique Tapigo « Chic & Élégant »** : fond sable, cartes blanches, titres en
*Cormorant Garamond*, texte en *Manrope*, boutons noir mat en pilule, doré en touche.
- Couleurs, rayons, ombres et courbe d'animation : variables en haut de
  [`src/app/globals.css`](src/app/globals.css) (avec les classes `.btn`, `.chip`, `.badge`,
  `.card`, `.input`, `.stat-tile`…). Changer une couleur à cet endroit la change partout.
- Polices : [`src/app/layout.tsx`](src/app/layout.tsx). Elles sont hébergées par le site
  lui-même (rien n'est demandé à Google depuis le téléphone du client).
- Icônes au trait : [`src/components/Icon.tsx`](src/components/Icon.tsx).
- Les animations sont coupées si le téléphone est réglé sur « Réduire les animations ».

---

## 9. Ajouter un nouveau bar

Chaque bar est totalement isolé des autres (tables, carte, commandes, personnel).

**Le plus simple : l'espace agence** → **Nouveau bar** (nom du bar et email du gérant),
puis envoie au gérant les identifiants affichés. Il se connecte sur `/admin`, crée sa
carte et ses tables, puis programme ses cartes NFC (tu peux aussi le faire pour lui :
fiche du bar → **Espace gérant**).

Sans espace agence, à la main dans Supabase :

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
- [ ] CGV : ce qui se passe à l'arrêt de l'abonnement (suspension du service, durée de
      conservation des données, export des commandes avant la fin).
- [ ] Lecture des bons : compte Anthropic au nom de Tapigo avec une limite de dépense
      mensuelle ; coût à inclure dans l'abonnement du bar ; indiquer dans la politique
      de confidentialité que les photos de bons sont envoyées à Anthropic pour lecture.
- [ ] Tester le scénario de démonstration sur place, avec le wifi / la 4G du bar.
