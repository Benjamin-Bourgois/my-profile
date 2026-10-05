# Commande à table

Web app de commande à table pour les bars. Le client approche son téléphone de la
carte posée sur la table (puce NFC ou QR code), voit la carte du bar, commande et
paie. La commande arrive en temps réel sur l'écran du bar avec le numéro de table.

> **Avancement**
> - ✅ Étape 1 : base de données, sécurité, données de démo, page client (lecture de la carte)
> - ⏳ Étape 2 : panier, commande, écran du bar en temps réel
> - ⏳ Étape 3 : paiement Stripe (mode test)
> - ⏳ Étape 4 : espace gérant (carte, tables, QR codes, réglages)
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
| `/t/<lien-secret>` | Le client (adresse écrite dans la puce NFC / le QR code) |

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
7. Récupère 3 valeurs (elles serviront dans Vercel) :
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

Le détail technique des erreurs est visible dans Vercel → ton projet → **Logs**.

---

## Ajouter un nouveau bar

En attendant un écran dédié, dans Supabase :

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
