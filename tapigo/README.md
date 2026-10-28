# Tapigo : commande à table par NFC

Web app de démonstration pour les restaurants Tapigo : menu interactif, prise de commande à table et dashboard cuisine.
HTML, CSS et JavaScript vanilla : aucune dépendance et aucune étape de build. Le dépôt se déploie tel quel (GitHub Pages, Netlify, Vercel…).

## Lancer la démo

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Ouvrez un **menu de table** et le **dashboard cuisine** dans deux onglets du même navigateur : les commandes, les changements de statut et les modifications du menu se synchronisent instantanément.

| Page | Rôle |
| --- | --- |
| `index.html` | Accueil de démo : simulateur des tags NFC (tables 1 à N) et accès au dashboard |
| `menu.html?table=12` | Interface client ouverte par le tag NFC |
| `kitchen.html` | Dashboard restaurateur (cuisine / bar et édition du menu) |
| `admin.html` | Administration Tapigo : restaurants et accès (mode en ligne) |

## Mode en ligne : plusieurs restaurants

Sans configuration, le site tourne en **mode démo** (données dans le navigateur uniquement).
Le **mode en ligne** s'appuie sur [Supabase](https://supabase.com) et gère plusieurs restaurants :

| Qui | Page | Accès |
| --- | --- | --- |
| Clients | `menu.html?r=<restaurant>` (plaque NFC) | Libre : voient la carte et commandent, paient à table ou en ligne |
| Restaurateurs | `kitchen.html` | E-mail et mot de passe. Chacun ne voit **que son restaurant** |
| Équipe Tapigo | `admin.html` | Crée les restaurants et donne les accès |

- **Rôles** : *Gérant* gère les commandes et la carte. *Équipe* gère les commandes uniquement. *Admin Tapigo* a accès à tous les restaurants.
- **Sécurité** : les prix sont recalculés par la base de données. Un client ne peut ni lire les commandes, ni modifier une carte. Un restaurateur ne voit jamais les données d'un autre restaurant.
- **Numéros de commande** : chaque restaurant a sa propre numérotation.

### Installation
1. Créez un projet Supabase.
2. Dans **SQL Editor**, collez et exécutez `supabase/schema.sql`. Le script peut être relancé sans risque, et il convertit automatiquement l'ancienne version « un seul restaurant ».
3. Dans **Authentication → Users → Add user**, créez votre compte (cochez « Auto Confirm User »), puis devenez administrateur :
   `insert into public.admins (user_id) select id from auth.users where email = 'vous@exemple.fr';`
4. Dans **Authentication → Sign In / Providers**, désactivez « Allow new users to sign up ».
5. Dans `js/config.js`, renseignez l'URL du projet et la clé `anon` / `publishable` (**jamais** la clé `service_role`).

### Ajouter un restaurant
1. Ouvrez `admin.html` et cliquez sur **Créer un restaurant** (nom, identifiant, nombre de tables, carte de départ).
2. Créez le compte du restaurateur dans Supabase (**Authentication → Users → Add user**, « Auto Confirm User »).
3. Dans `admin.html`, saisissez son e-mail, cliquez sur **Donner l’accès**, puis **Copier le lien NFC** : ce lien unique (`menu.html?r=<restaurant>`) s’écrit sur toutes les plaques du restaurant, et le client indique lui-même son numéro de table.
4. Envoyez-lui le lien `kitchen.html`, son e-mail et son mot de passe provisoire. Il le change ensuite dans **Mon compte**.

## Fonctionnalités

**Client** (plaque NFC → `menu.html?r=<restaurant>`)
- Numéro de table saisi à l'arrivée et vérifié, modifiable via le badge.
- Carte par catégories personnalisables, filtres rapides, recherche, photos.
- Fiche produit : options et suppléments, **14 allergènes réglementaires**, suggestions « Parfait avec ».
- Panier avec notes pour la cuisine. **Payer à table** : le client indique s'il réglera en **espèces, par carte ou les deux** (moyens acceptés réglables dans Établissement), affiché au bar sur le ticket et sur la table (« À encaisser · Espèces ») ou, si le restaurant l'active, **Payer maintenant** depuis le téléphone (carte, Apple Pay, Google Pay via Stripe). La commande part en cuisine dès le paiement validé.
- **Bouton Service** : « Appeler un serveur » ou « Demander l'addition ».
- **Pourboire** avec le paiement en ligne : 5 %, 10 %, 15 % ou montant libre, ajouté au paiement Stripe et reversé au restaurant (désactivable dans Établissement).
- **Serveur de la table** affiché au client (« Votre serveur : Marco »), attribué depuis le dashboard.
- **Avis Google** : quand la commande passe en « Terminée », le client est remercié puis redirigé vers la page d'avis après 6 secondes (bouton « Non merci » pour annuler).
- Suivi en temps réel (Envoyée → En préparation → Prête → Servie), puis invitation à laisser un **avis Google**.
- Bandeau « Commandes en pause » quand le restaurant suspend les commandes.

**Restaurateur** (`kitchen.html`)
- Commandes en temps réel, par statut ou par table, filtre Cuisine / Bar.
- Appels des tables mis en évidence (« Table 4 demande l'addition »), avec sonnerie.
- **Encaisser et clôturer une table** en un clic, **impression du ticket** (80 mm).
- Fiabilité de la tablette : écran maintenu allumé, rappel sonore tant qu'une commande ou un appel n'est pas traité, bandeau « connexion perdue ».
- Bouton **Pause** pour suspendre les commandes en ligne lors d'un coup de feu.
- Carte : catégories (ajout, renommage, ordre), photos envoyées depuis le téléphone, allergènes, suggestions, prix et ruptures en direct.
- **Bilan du mois** (Statistiques → « Bilan du mois ») : ce que Tapigo a rapporté (ventes en plus grâce aux suggestions « Parfait avec », temps de service gagné), chiffre d'affaires, commandes et panier moyen comparés au mois précédent, meilleures ventes et repères, à imprimer ou enregistrer en PDF.
- **Dates limites (onglet Dates)** : produits datés de la cuisine et du bar (DLC ou DDM / DLUO, quantité, note), classés « Dépassées », « Aujourd'hui et demain », « Dans les 7 jours », « Plus tard », avec un compteur sur l'onglet. Boutons Utilisé / Jeté (suivi du gaspillage du mois). Un compte équipe ne voit que son poste (Cuisine, Bar ou les deux), réglé par le gérant (Dates → « Postes de l'équipe ») ou dans admin.html ; le gérant voit tout.
- **Statistiques** : chiffre d'affaires par jour, affluence par heure, plats les plus vendus, panier moyen, temps de préparation, part cuisine / bar, export CSV.
- **Serveurs des tables** : on choisit un prénom, on touche les tables, c'est affiché au client et sur les tickets. Modifiable en direct depuis la vue « Par table ».
- **Prise de commande en salle** (tous les rôles) : le serveur choisit la table, ajoute les plats et leurs options, note pour la cuisine, puis envoie. Commande marquée « Prise en salle », non bloquée par la pause ni par l'anti-abus, stocks vérifiés.
- **Stocks** (toute l'équipe, gérant ou non) : quantités restantes décomptées à chaque commande, plat retiré de la carte à 0, « Plus que N » côté client, mise en rupture / remise en vente, alerte « épuisé » en cuisine.
- **Prévision IA du stock** : chaque matin, Claude analyse les ventes des 8 dernières semaines (même jour, tendance, contexte saisi par l'équipe) et propose la quantité à prévoir par produit, avec une explication. Le stock conseillé s'affiche dans une colonne « Conseillé » à côté du stock réel (avec ce qui manque) ; il ne modifie jamais le stock réel.
- **Bon de livraison lu par l'IA** (Stocks → « Scanner un bon ») : photo ou PDF du bon du fournisseur (4 pages au maximum). Claude retrouve les produits de la carte et calcule les portions à ajouter (2 cartons de 24 canettes → 48 ; un fût de 30 L pour une pression de 25 cl → 120), en signalant les lignes à vérifier. L'équipe corrige si besoin puis valide : les quantités s'ajoutent au stock restant, une seule fois par bon. 20 lectures par restaurant et par heure au maximum.
- **Paiement en ligne** (gérant, dans Établissement) : connexion du compte Stripe du restaurant et activation de « Payer maintenant ». Aucune commission Tapigo.
- Rôles : Gérant (tout) / Équipe (commandes et stocks ; ni prix, ni carte, ni statistiques).

**Tapigo** (`admin.html`)
- Création des restaurants, gestion des accès, lien NFC unique par restaurant.
- **Suspension** (impayé…) : bouton « Suspendre » avec un motif. Les clients ne peuvent plus commander et l'équipe du restaurant voit un écran « Accès suspendu » (motif et date) au lieu du dashboard ; la base refuse ses actions. « Réactiver » rend l'accès, sans perte de données.
- **Abonnements** : formule, prix mensuel, statut (essai, à jour, en retard, résilié), échéance, revenu mensuel total. Aucune commission sur les ventes.
- Génération de **30 jours de données de démonstration** pour présenter les statistiques (marquées « démo », supprimables).

**Sécurité** : prix recalculés par la base, anti-abus (6 commandes maximum par table toutes les 10 minutes), table inexistante refusée, isolation complète entre restaurants (RLS).

## Architecture

```
.
├── index.html          Accueil démo / simulateur NFC
├── menu.html           Interface client
├── kitchen.html        Dashboard cuisine & bar
├── admin.html          Administration Tapigo (restaurants, accès)
├── supabase/
│   ├── schema.sql      Base de données, droits et fonctions (mode en ligne)
│   ├── cron.sql        Prévision de stock automatique chaque matin
│   └── functions/      Fonctions serveur : stripe-connect, stripe-checkout,
│                       stripe-webhook, stock-forecast et stock-scan (Claude)
├── css/tapigo.css      Charte « Chic & Élégant » (tokens, composants, responsive)
└── js/
    ├── data.js         Données de démonstration (restaurant, catégories, plats, options)
    ├── config.js       URL et clé Supabase (vide = mode démo)
    ├── store.js        Backend simulé : persistance et temps réel (mode démo)
    ├── store-remote.js Connecteur Supabase (mode en ligne)
    ├── ui.js           Bottom sheets, toasts, icônes, son, repli d’image
    ├── menu.js         Logique client
    ├── kitchen.js      Logique restaurateur
    ├── stats.js        Statistiques (graphiques SVG, export CSV)
    └── admin.js        Logique administration
```

`store.js` est le **seul** module qui touche aux données. En démo, il s’appuie sur `localStorage` et `BroadcastChannel`. Pour passer en production, il suffit de réimplémenter son API (`getMenu`, `saveItem`, `createOrder`, `updateOrderStatus`, `subscribe`…) au-dessus de Supabase, de Firebase ou d’une API REST + WebSocket. Les correspondances sont détaillées en tête du fichier.

### Fonctions serveur (paiement en ligne et prévision IA)

Ces deux options reposent sur des **Supabase Edge Functions** (`supabase/functions/`), qui gardent les clés secrètes côté serveur. Le site fonctionne sans elles : paiement à table uniquement et pas de prévision.

1. **Base** : relancez `supabase/schema.sql` dans SQL Editor.
2. **Secrets** (Supabase → Edge Functions → Secrets) :

   | Secret | Valeur |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Clé secrète Stripe de Tapigo (`sk_live_…`, ou `sk_test_…` pour tester) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` donné par Stripe à l'étape 4 |
   | `ANTHROPIC_API_KEY` | Clé de l'API Claude (console.anthropic.com) : prévision du stock et lecture des bons de livraison |
   | `CRON_SECRET` | Un mot de passe long, au hasard |
   | `SITE_URL` | `https://tom-kempakinosky.github.io/tapigo` |

3. **Déploiement** : ajoutez le secret GitHub `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens) puis lancez l'action **Fonctions Supabase** (onglet Actions). Elle se relance seule à chaque modification de `supabase/functions/`. Sans GitHub : `npx supabase functions deploy --no-verify-jwt --project-ref <ref>`.
4. **Stripe** : activez **Connect** sur le compte Stripe de Tapigo, puis dans Développeurs → Webhooks, ajoutez l'adresse `https://<ref>.supabase.co/functions/v1/stripe-webhook` en cochant **« Événements sur les comptes connectés »**, avec les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` et `account.updated`.
5. **Prévision chaque matin** : exécutez `supabase/cron.sql` dans SQL Editor (en y mettant votre `CRON_SECRET`).

**Paiement en ligne, comment ça marche.** Chaque restaurant connecte son propre compte Stripe (*Standard*) depuis Établissement. Le client choisit « Payer maintenant » : la commande est créée (prix recalculés, stock réservé) mais reste invisible en cuisine ; il paie sur la page sécurisée de Stripe ; le webhook confirme le paiement et la commande arrive en cuisine marquée « Payé · en ligne ». Paiement abandonné : la commande est supprimée et le stock rendu. L'argent va directement au restaurant ; Tapigo ne prend aucune commission.

**Prévision IA.** La fonction `stock-forecast` calcule une base statistique (moyenne pondérée des mêmes jours de semaine + 15 %), puis demande à Claude (`claude-opus-5-5`, sortie JSON structurée) de l'ajuster et de l'expliquer. Les requêtes refusées par le modèle sont relancées automatiquement sur le modèle de secours recommandé par Anthropic (`fallbacks: "default"`). Sans clé `ANTHROPIC_API_KEY` ou en cas d'erreur, la base statistique est enregistrée seule. Coût : un appel par restaurant et par jour, plus les recalculs manuels (limités à un par minute).

### Programmer les tags NFC

Écrivez sur toutes les plaques (NTAG213/215) du restaurant le même enregistrement URL, copié depuis `admin.html` :
`https://tom-kempakinosky.github.io/tapigo/menu.html?r=<restaurant>`. Le client indique son numéro de table.

## Charte

- Fond sable `#FBF9F5`, cartes blanches, filets `#E6DFD2`.
- Titres en *Cormorant Garamond* et texte en *Manrope*.
- Boutons noirs mats `#1D1C1A` en forme de pilule, accent doré `#A6895A`.
- Pensé mobile d’abord : bottom sheets à faire glisser, barre panier flottante, zones `safe-area`. Les animations respectent `prefers-reduced-motion`.
