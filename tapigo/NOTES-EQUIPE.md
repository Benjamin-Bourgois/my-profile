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
- Le fichier `.github/workflows/supabase-functions.yml` ne s'exécute pas depuis ce sous-dossier (GitHub ne lit
  que le dossier `.github` à la racine du dépôt). Les fonctions sont déployées depuis le dépôt de Tom tant
  qu'on n'a pas décidé du dépôt définitif.

## L'ancienne application : `commande-bar/` (mise de côté)

Application Next.js + Vercel construite par Benjamin, toujours en ligne sur https://commande-bar.vercel.app.
**On n'y touche plus** ; elle sert de réserve. Fonctions à y reprendre pour les porter dans `tapigo/` :

- [ ] Scan des bons de livraison par l'IA (photo du bon → mise à jour du stock)
- [ ] Règlement au serveur : espèces, carte ou les deux
- [ ] Paiement simulé pour les bars de démonstration
- [ ] Suspension d'un bar depuis l'espace admin (impayé)
- [ ] Bilan mensuel « ce que l'application vous a rapporté »

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

- **28/10/2026 · Benjamin** : `tapigo/` en ligne sur Vercel (Root Directory `tapigo`, Framework « Other »). Compte
  administrateur Benjamin créé dans le Supabase de Tom (table `admins`). Projet Vercel vide « tapigo » à supprimer.
- **28/10/2026 · Benjamin** : copie de l'application de Tom dans `tapigo/`, `commande-bar/` mise de côté.
