# Notes d'équipe Tapigo

Mémoire partagée entre les cofondateurs et leurs sessions Claude. **Chaque session Claude lit ce fichier au
démarrage et le met à jour à la fin** (section « Journal » et « À faire »). Les conversations Claude ne sont pas
partagées : tout ce qui doit être connu de l'autre associé s'écrit ici.

> Ce dépôt est **public** : jamais de clé secrète, de numéro de téléphone, d'email personnel, de chiffre
> d'affaires ni de document commercial ici. Les clés vont dans Vercel (variables d'environnement), les documents
> commerciaux dans le Drive partagé.

## Le produit

Tapigo : application web de commande à table pour les bars, revendue sous forme d'abonnement mensuel ou annuel.
Le client touche une carte NFC (ou scanne un QR code) sur sa table, commande et paie depuis son téléphone, sans
application à télécharger. La commande arrive sur l'écran du bar.

- Site : https://commande-bar.vercel.app
- Code : dossier `commande-bar/` de ce dépôt
- Stack : Next.js 16 (App Router, `proxy.ts`), React 19, Tailwind v4, Supabase (Postgres, Auth, RPC
  `security definer`), Stripe Checkout, API Claude pour la lecture des bons de livraison, hébergement Vercel
- **Une seule application pour tous les bars** (multi-établissements) : chaque bar est une ligne de la table
  `venues`, ses données sont cloisonnées par la base. Un seul Supabase, un seul GitHub, un seul Vercel.

## Ce qui est construit

| Partie | Pages | Script SQL |
| --- | --- | --- |
| Carte, panier, commande client | `/t/<lien-secret>` | 1 à 5 |
| Écran du bar, son « ding » | `/bar` | 1 à 5 |
| Prise de commande par le serveur | `/bar/commande` | 7 |
| Statistiques du gérant | `/statistiques` | 6 |
| Stocks, recettes, alertes | `/stocks` | 7 |
| Scan des bons de livraison par l'IA | `/stocks` → « Scanner un bon » | 8 |
| Espace agence : bars, comptes, suspension, usage IA | `/agence` | 9 |
| Suggestions (« souvent pris avec ») | carte client, réglages | 10 |
| Règlement au serveur : espèces, carte ou les deux | panier, écran du bar | 11 |
| Paiement en ligne simulé pour les bars « Démo » | `/t/<lien>/paiement-demo/<n°>` | 12 |

Les scripts `supabase/N-*.sql` s'exécutent **dans l'ordre**, une seule fois chacun, dans Supabase → SQL Editor.
Le README détaille l'installation, les variables Vercel et les tests.

## Règles de travail

1. **Toujours partir de la dernière version de `main`.** Démarrer une nouvelle session Claude plutôt que
   reprendre une vieille conversation.
2. **Une tâche = une branche = une fusion.** Fusionner sur `main` à la fin de chaque tâche, pas une semaine après.
   Vercel remet le site en ligne tout seul après chaque fusion.
3. **Se répartir les tâches** (voir « À faire ») pour ne pas modifier les mêmes fichiers en même temps.
4. **Nouveau changement de base de données = nouveau script numéroté** (`13-…sql`, puis `14-…sql`), jamais la
   modification d'un script déjà exécuté. Noter dans le Journal qu'il faut l'exécuter.
5. **Clés secrètes uniquement dans Vercel**, jamais dans le code ni dans une conversation.
6. Les textes de l'application sont en français, simples, pensés pour un bar en plein service.

## Décisions prises

- Pas de connecteur de caisse pour l'instant : l'application n'est pas une caisse certifiée NF525, le bar garde
  sa caisse et y saisit les ventes. Un connecteur de caisse est une évolution possible plus tard.
- Paiement en ligne : Stripe. Tant que Stripe n'est pas branché, les bars marqués « Démo » dans l'espace agence
  ont un paiement simulé (aucun argent débité) pour les démonstrations.
- Personnalisation aux couleurs de chaque bar (logo, couleur) : idée retenue, **pas encore développée**. Elle se
  ferait dans la fiche du bar (`venues`), pas en dupliquant l'application.
- Le logo de l'application sera mis aux couleurs dorées Tapigo plus tard (les emails l'ont déjà).
- Offre commerciale : un seul abonnement, trois paliers selon le nombre de tables, tarif fondateur pour les
  10 premiers bars. Détails chiffrés dans le Drive (Excel Tapigo_Agency, contrats de licence).

## À faire

- [ ] Brancher Stripe en production (clés dans Vercel, webhook)
- [ ] Passer Vercel en Pro avant le premier bar payant (le plan gratuit interdit l'usage commercial)
- [ ] Ajouter l'associé comme collaborateur GitHub, membre Supabase et membre de l'équipe Vercel
- [ ] Personnalisation par bar (logo, couleurs) — à décider
- [ ] Logo de l'application aux couleurs dorées

## Journal

Le plus récent en haut. Une ligne par session : date, qui, ce qui a changé, ce qu'il reste à faire.

- **28/10/2026 · Benjamin** : création de ce fichier. Logo Tapigo des signatures email ajouté dans
  `public/email/`. À fusionner sur `main`.
- **Octobre 2026 · Benjamin** : paiement démo (script 12), règlement au serveur (script 11), suggestions
  (script 10), espace agence (script 9), scan des bons (script 8), stocks et commandes serveur (script 7),
  statistiques (script 6), charte graphique.
