# Notes d'équipe Tapigo

Mémoire partagée entre les cofondateurs et leurs sessions Claude. **Chaque session Claude lit ce fichier au
démarrage et le met à jour à la fin** (sections « À faire » et « Journal »). Les conversations Claude ne sont pas
partagées : tout ce que l'autre associé doit savoir s'écrit ici.

> Ce dépôt est **public** : jamais de clé secrète, de numéro de téléphone, d'email personnel, de chiffre
> d'affaires ni de document commercial ici. Les clés secrètes vont dans Supabase (Edge Functions → Secrets),
> les documents commerciaux dans le Drive partagé.

## L'application de travail : ce dossier `tapigo/`

Copie de l'application de Tom (`tom-kempakinosky/tapigo`, commit `f4892d1` du 11/10/2026). **C'est ici qu'on
travaille désormais.**

- HTML, CSS et JavaScript simples, sans étape de build. Le README décrit les pages, l'installation et les
  fonctions.
- Base de données et partie serveur : Supabase (projet `frylasycjociuxpcsmvc`, celui de Tom). Les fonctions
  serveur (Stripe Connect, paiement, webhook, prévision IA du stock) sont dans `supabase/functions/`.
- La charte graphique est dans `DESIGN.md` : à respecter strictement.
- Les fonctions serveur sont déployées par `.github/workflows/tapigo-supabase-functions.yml`, à la racine du
  dépôt, à chaque modification de `tapigo/supabase/functions/` sur `main` (secret GitHub
  `SUPABASE_ACCESS_TOKEN` requis). Le fichier `tapigo/.github/` est celui d'origine de Tom et ne s'exécute pas.
  Ne plus modifier les fonctions dans le dépôt de Tom : son déploiement écraserait celui-ci.

## L'ancienne application : `commande-bar/` (mise de côté)

Application Next.js + Vercel construite par Benjamin, toujours en ligne sur https://commande-bar.vercel.app.
**On n'y touche plus** ; elle sert de réserve. Fonctions à y reprendre pour les porter dans `tapigo/` :

- [x] Scan des bons de livraison par l'IA (photo du bon → mise à jour du stock) : fonction `stock-scan`, table
  `stock_scans`, fonction SQL `add_delivery_stock`, bloc « Bon de livraison » de l'onglet Stocks
- [x] Règlement au serveur : espèces, carte ou les deux (`place_order` accepte `cash`, `card`, `mixed` ;
  `payment.with` ; réglage `info.onsiteWith` dans Établissement)
- [ ] ~~Paiement simulé pour les bars de démonstration~~ (abandonné le 28/10/2026)
- [x] Suspension d'un bar depuis l'espace admin (impayé) : `admin_suspend` (motif dans `restaurant_billing`),
  `member_role` refuse l'équipe d'un restaurant suspendu, écran « Accès suspendu » dans le dashboard
- [x] Bilan mensuel « ce que l'application vous a rapporté » : Statistiques → « Bilan du mois » ; lignes de commande
  avec `suggested` (quantité ajoutée depuis « Parfait avec »)

## Règles de travail

1. **Toujours partir de la dernière version.** Démarrer une nouvelle session Claude plutôt que reprendre une
   vieille conversation.
2. **Une tâche à la fois, fusionnée dès qu'elle est finie.**
3. **Se répartir les tâches** (voir « À faire ») pour ne pas modifier les mêmes fichiers en même temps.
4. **Changement de base de données** : `supabase/schema.sql` se relance sans risque ; toute modification doit
   le rester (`if not exists`, `create or replace`). Noter dans le Journal qu'il faut le relancer.
5. **Clés secrètes uniquement dans Supabase** (ou Vercel), jamais dans le code ni dans une conversation.
6. Textes en français, simples, pensés pour un bar en plein service.

## Décisions prises

- On repart de l'application de Tom (plus complète au quotidien : options, allergènes, appel serveur, Stripe
  Connect, avis Google, prévision de stock).
- Avant d'équiper le premier bar : une adresse définitive à notre nom (ex. un domaine Tapigo) pour les cartes
  NFC, afin de ne jamais avoir à les reprogrammer.
- Vercel : utile pour l'adresse pro et les aperçus avant mise en ligne, pas obligatoire pour la sécurité (la
  partie serveur est dans Supabase).
- L'application n'est pas une caisse certifiée NF525 : le bar garde sa caisse.

## À faire

- [ ] Choisir et acheter le nom de domaine
- [x] Mettre ce dossier en ligne sur Vercel : projet « my-profile-tapigo », https://my-profile-tapigo.vercel.app
- [ ] Brancher le nom de domaine sur ce projet Vercel
- [ ] Supabase → Edge Functions → Secrets : `SITE_URL` = l'adresse Vercel (quand le paiement en ligne sera branché)
- [ ] Porter les fonctions de `commande-bar/` listées plus haut

## Journal

Le plus récent en haut.

- **29/10/2026 · Benjamin** : « Utilisé » / « Jeté » avec quantité, unité et motif (`move_expiry`, table
  `expiry_moves`, lots `amount` + `unit`) et « Bilan des pertes » dans l'onglet Dates. À faire une fois : relancer
  `supabase/schema.sql`. Fichiers en `?v=27`.
- **29/10/2026 · Benjamin** : lots datés reliés au stock : `expiry_items.portions`, déclencheur `expiry_follow_stock`
  sur `item_stock` (décompte FEFO à chaque baisse de stock), lot jeté retiré du stock. À faire une fois : relancer
  `supabase/schema.sql`. Fichiers en `?v=26`.
- **28/10/2026 · Benjamin** : dates limites lues automatiquement : DLC / lot relevés au scan du bon (proposés pour
  l'onglet Dates) et bouton « Lire l'étiquette » (fonction `label-scan`). `stock_scans.kind` ('bon' / 'etiquette').
  À faire une fois : relancer `supabase/schema.sql`. Fichiers en `?v=25`.
- **28/10/2026 · Benjamin** : onglet « Dates » (DLC / DDM) : table `expiry_items`, `add_expiry`, `close_expiry`,
  poste des comptes équipe (`restaurant_members.station`, réglé par le gérant via `team_members` /
  `set_member_station`, ou dans admin.html). À faire une fois : relancer `supabase/schema.sql`. Fichiers en `?v=24`.
- **28/10/2026 · Benjamin** : bilan du mois dans Statistiques. Paiement simulé de démo abandonné (décision). À faire
  une fois : relancer `supabase/schema.sql`. Fichiers en `?v=22`.
- **28/10/2026 · Benjamin** : suspension d'un bar (admin.html → « Suspendre » / « Réactiver »). À faire une fois :
  relancer `supabase/schema.sql`. Fichiers en `?v=21`.
- **28/10/2026 · Benjamin** : le bandeau « paie en ligne » disparaît après « Annuler », « Encaissé à table » ou un
  « Vérifier » concluant (le temps réel ne diffuse pas les suppressions filtrées). Fichiers en `?v=20`.
- **28/10/2026 · Benjamin** : commandes « paie en ligne » bloquées : boutons « Encaissé à table » (espèces / carte /
  les deux, page Stripe fermée, action `onsite` de `stripe-checkout` + SQL `payment_onsite`) et « Annuler »
  (commande supprimée, stock rendu). À faire une fois : relancer `supabase/schema.sql`. Fichiers en `?v=19`.
- **28/10/2026 · Benjamin** : bouton « Valider la commande » sur chaque ticket, quel que soit l'avancement (passe en
  « Terminée », notée encaissée, avec confirmation si elle n'est pas payée). Fichiers CSS/JS en `?v=18`.
- **28/10/2026 · Benjamin** : « Payer à table » avec le choix espèces / carte / les deux, affiché au bar. À faire une
  fois : relancer `supabase/schema.sql`. Fichiers CSS/JS en `?v=17`.
- **28/10/2026 · Benjamin** : prévision IA du stock : plus de bouton « Appliquer ». Colonne « Conseillé » à côté du
  « Stock réel » dans la liste, avec « manque N » ; les produits en dessous du conseillé passent dans « À surveiller ».
  Fichiers CSS/JS en `?v=16`.
- **28/10/2026 · Benjamin** : scan des bons de livraison par l'IA dans l'onglet Stocks. À faire une fois : relancer
  `supabase/schema.sql`, ajouter le secret GitHub `SUPABASE_ACCESS_TOKEN`, vérifier le secret Supabase
  `ANTHROPIC_API_KEY`. Fichiers CSS/JS en `?v=15`.
- **28/10/2026 · Benjamin** : `tapigo/` en ligne sur Vercel (Root Directory `tapigo`, Framework « Other »). Compte
  administrateur Benjamin créé dans le Supabase de Tom (table `admins`). Projet Vercel vide « tapigo » à supprimer.
- **28/10/2026 · Benjamin** : copie de l'application de Tom dans `tapigo/`, `commande-bar/` mise de côté.
