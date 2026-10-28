# Charte graphique Tapigo, « Chic & Élégant »

> **À coller dans Claude.** Ce document décrit précisément le style visuel des web apps Tapigo.
> Consigne pour l'assistant : *« Applique strictement cette charte à toute l'interface : utilise exactement
> ces couleurs (variables CSS), ces polices, ces rayons, ces ombres, ces composants et ces animations.
> N'invente pas d'autres couleurs ni d'autres polices. En cas de doute, choisis l'option la plus sobre. »*

---

## 1. L'esprit

Une interface qui évoque **la carte d'un restaurant gastronomique**, plutôt qu'un logiciel :

- **un fond sable chaud** (jamais blanc pur) et des cartes blanches posées dessus ;
- **une typographie à contraste** : un serif élégant pour les titres, une linéale moderne et lisible pour le texte ;
- **des boutons noirs mats en pilule** et une seule touche d'accent doré, utilisée avec parcimonie ;
- **beaucoup d'air**, des filets fins couleur lin, des ombres à peine perceptibles ;
- **des mouvements doux et rapides**, sans rebond ni effet gadget ;
- **pensé d'abord pour le téléphone**, d'une seule main.

Mots-clés : sobre, chaleureux, premium, calme, lisible.

---

## 2. Couleurs (variables CSS à reprendre telles quelles)

```css
:root {
  /* Fonds */
  --sand:   #FBF9F5;  /* fond de page : jamais de blanc pur en fond */
  --sand-2: #F4F0E8;  /* fonds secondaires, boutons doux, zones groupées */
  --sand-3: #ECE6DA;  /* survol des fonds secondaires, interrupteur éteint */
  --card:   #FFFFFF;  /* cartes, champs, fiches */
  --line:   #E6DFD2;  /* filets et bordures (1px partout) */

  /* Texte */
  --ink:   #171615;   /* texte principal, titres */
  --ink-2: #4F4B45;   /* texte secondaire, descriptions, libellés */
  --muted: #8B857B;   /* aides, métadonnées, surtitres */

  /* Action */
  --matte:       #1D1C1A;  /* boutons principaux, éléments actifs, badges sombres */
  --matte-hover: #2E2C29;

  /* Accent (avec parcimonie : badge « Signature », compteurs, filtres actifs) */
  --gold:      #A6895A;
  --gold-soft: #F1E9DA;

  /* États : toujours accompagnés d'un texte ou d'une icône, jamais la couleur seule */
  --ok:     #4D7A5B;  --ok-soft:     #E6EFE7;   /* payé, en stock, succès */
  --warn:   #B9822F;  --warn-soft:   #F7EDDC;   /* à encaisser, stock bas, attente */
  --danger: #A9503D;  --danger-soft: #F6E4DF;   /* rupture, retard, erreur, allergie */
  --info:   #4B6584;  --info-soft:   #E5EBF2;   /* information neutre (« Bar », « Prise en salle ») */

  /* Graphiques (une seule teinte, validée pour le contraste) */
  --chart: #A8772B;

  /* Typographies */
  --serif: 'Cormorant Garamond', 'Times New Roman', serif;
  --sans:  'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif;

  /* Rayons */
  --r-sm: 10px;   /* champs de saisie */
  --r-md: 16px;   /* cartes, fiches, notifications */
  --r-lg: 24px;   /* grands panneaux, fenêtres, colonnes */

  /* Ombres (très légères) */
  --shadow-1: 0 1px 2px rgba(23,22,21,.04), 0 4px 16px rgba(23,22,21,.05);  /* cartes au survol */
  --shadow-2: 0 10px 40px rgba(23,22,21,.14);                               /* éléments flottants */

  /* Mouvement */
  --ease: cubic-bezier(.22, .8, .24, 1);   /* courbe unique pour toutes les animations */
  --safe-b: env(safe-area-inset-bottom, 0px);
}
```

**Textes sur badges teintés** (contraste renforcé) : doré `#7C6338`, attente `#8C5F1C`.

**Répartition visuelle** : environ 80 % sable et blanc, 15 % encre et noir mat, 5 % doré et couleurs d'état.

---

## 3. Typographie

Chargement Google Fonts :

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,600&family=Manrope:wght@400;500;600;700;800&display=swap">
```

| Usage | Police | Taille | Graisse | Autres réglages |
|---|---|---|---|---|
| Titre de page / restaurant | Cormorant Garamond | 26–34 px (clamp jusqu'à 58 px sur l'accueil) | 600 | interligne 1.15 |
| Titre de section (« Entrées ») | Cormorant Garamond | 28–30 px | 600 | |
| Nom d'un plat, titre de carte | Cormorant Garamond | 21–22 px | 600 | |
| Grands chiffres (statistiques, n° de table) | Cormorant Garamond | 24–32 px | 600 | `font-variant-numeric: tabular-nums` |
| Texte courant | Manrope | 15 px | 400–500 | interligne 1.5, `-webkit-font-smoothing: antialiased` |
| Descriptions | Manrope | 13 px | 400 | couleur `--ink-2`, 2 lignes max (line-clamp) |
| Libellés de champs | Manrope | 13 px | 600 | couleur `--ink-2` |
| Boutons | Manrope | 15 px (13 px en petit) | 600 | letter-spacing .01em |
| Prix | Manrope | 15 px | 700 | `tabular-nums` |
| **Surtitre** (« ÉTAPE FINALE ») | Manrope | 11 px | 700 | MAJUSCULES, letter-spacing .16em, `--muted` |
| Badges | Manrope | 11 px | 700 | MAJUSCULES, letter-spacing .06em |

Règle : **serif = émotion** (titres, noms, grands chiffres), **linéale = information** (tout le reste).
Le logo est un rond noir mat avec l'initiale en Cormorant Garamond *italique*, couleur sable.

---

## 4. Composants (CSS de référence)

### Base
```css
* , *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--sand); color: var(--ink); font-family: var(--sans);
       font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased;
       -webkit-tap-highlight-color: transparent; }
h1, h2, h3, h4 { font-family: var(--serif); font-weight: 600; margin: 0; line-height: 1.15; }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
```

### Boutons, toujours en pilule
```css
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
       min-height: 48px; padding: 0 22px; border: 1px solid transparent; border-radius: 999px;
       font-weight: 600; font-size: 15px; letter-spacing: .01em;
       transition: background .2s var(--ease), transform .15s var(--ease), border-color .2s; }
.btn:active { transform: scale(.98); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn--primary { background: var(--matte); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
.btn--primary:hover { background: var(--matte-hover); }
.btn--ghost   { background: transparent; border-color: var(--line); color: var(--ink); }
.btn--ghost:hover { border-color: var(--ink-2); }
.btn--soft    { background: var(--sand-2); color: var(--ink); }
.btn--danger  { background: transparent; color: var(--danger); border-color: var(--danger-soft); }
.btn--sm      { min-height: 36px; padding: 0 14px; font-size: 13px; }
.icon-btn { width: 40px; height: 40px; border-radius: 50%; display: inline-grid; place-items: center;
            border: 1px solid var(--line); background: var(--card); }
```
- **Un seul bouton noir mat par écran** : l'action principale (« Commander · 54,00 € »). Les autres boutons sont en contour ou doux.
- Le libellé de l'action principale **inclut le montant** quand il y en a un.
- **Hauteur tactile minimale** : 48 px pour un bouton, 40 px pour un bouton icône.

### Pastilles de filtre (chips)
```css
.chip { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--card);
        font-size: 14px; font-weight: 600; color: var(--ink-2); transition: all .2s var(--ease); }
.chip[aria-pressed="true"] { background: var(--matte); border-color: var(--matte); color: #fff; }
.chip--tag[aria-pressed="true"] { background: var(--gold-soft); border-color: var(--gold); color: #6C552E; }
```
Les rangées de pastilles défilent horizontalement, sans barre de défilement visible.

### Badges
```css
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px;
         font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
         background: var(--sand-2); color: var(--ink-2); }
.badge--gold   { background: var(--gold-soft);   color: #7C6338; }
.badge--ok     { background: var(--ok-soft);     color: var(--ok); }
.badge--warn   { background: var(--warn-soft);   color: #8C5F1C; }
.badge--danger { background: var(--danger-soft); color: var(--danger); }
.badge--info   { background: var(--info-soft);   color: var(--info); }
.badge--dark   { background: var(--matte);       color: #fff; }
```

### Cartes (ex. un plat de la carte)
```css
.card { padding: 14px; border-radius: var(--r-md); background: var(--card); border: 1px solid var(--line);
        transition: box-shadow .2s var(--ease), border-color .2s, transform .2s var(--ease); }
.card:hover  { box-shadow: var(--shadow-1); border-color: var(--sand-3); }
.card:active { transform: scale(.99); }
```
**Carte « plat »** : texte à gauche (nom en serif 21 px, description en 2 lignes, prix en gras) et photo carrée de 112 px à droite (rayon 12 px), avec un bouton rond noir « + » de 34 px posé en bas à droite de la photo.

### Champs de saisie
```css
.field { display: grid; gap: 6px; }
.field > span { font-size: 13px; font-weight: 600; color: var(--ink-2); }
.input { width: 100%; min-height: 46px; padding: 11px 14px; border: 1px solid var(--line);
         border-radius: var(--r-sm); background: var(--card); outline: none; transition: border-color .2s, box-shadow .2s; }
.input:focus { border-color: var(--ink-2); box-shadow: 0 0 0 3px rgba(23,22,21,.06); }
```
Barre de recherche : une pilule de 46 px de haut, avec l'icône loupe à gauche.

### Interrupteur
```css
.switch__track { width: 42px; height: 24px; border-radius: 999px; background: var(--sand-3); position: relative; transition: background .2s; }
.switch__track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
                        background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: transform .25s var(--ease); }
input:checked + .switch__track { background: var(--ok); }
input:checked + .switch__track::after { transform: translateX(18px); }
```

### Fenêtre « bottom sheet » (le cœur de l'expérience mobile)
```css
.sheet-backdrop { position: fixed; inset: 0; background: rgba(23,22,21,.42); animation: fadeIn .3s var(--ease); }
.sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%);
         width: min(680px, 100vw); max-height: 92dvh; display: flex; flex-direction: column;
         background: var(--sand); border-radius: 24px 24px 0 0; box-shadow: var(--shadow-2);
         overflow: clip; animation: sheetIn .42s var(--ease); }
@keyframes sheetIn { from { transform: translate(-50%, 100%); } }
/* Bureau (≥ 720px) : la même fenêtre devient une modale centrée, rayon 24px partout */
```
- **Poignée grise** en haut (40 × 4 px), qu'on peut faire glisser vers le bas pour fermer.
- **Bouton rond « × »** en haut à droite.
- **Pied de fenêtre fixe**, avec l'action principale noire sur toute la largeur.
- **Échap ou clic sur le fond** referme la fenêtre.

### Notification (toast)
Pilule rectangulaire **noir mat** en haut au centre, texte blanc en 14 px avec les mots importants en gras. Elle apparaît en glissant de 12 px vers le bas et disparaît après 2,6 s.
```css
.toast { padding: 14px 16px; border-radius: var(--r-md); background: var(--matte); color: #fff;
         box-shadow: var(--shadow-2); font-size: 14px; animation: toastIn .35s var(--ease); }
@keyframes toastIn { from { opacity: 0; transform: translateY(-12px) scale(.98); } }
```

### Tuile de chiffre clé
```css
.stat-tile { padding: 16px; border-radius: var(--r-md); background: var(--card); border: 1px solid var(--line); display: grid; gap: 2px; }
.stat-tile span { font-size: 12px; font-weight: 700; color: var(--muted); }    /* libellé */
.stat-tile b    { font-family: var(--serif); font-size: 32px; font-weight: 600; font-variant-numeric: tabular-nums; } /* valeur */
.stat-tile small{ font-size: 12px; color: var(--ink-2); }                       /* contexte */
```

### Autres éléments signature
- **Barre panier flottante** : pilule noire mat de 60 px de haut, en bas d'écran (16 px du bord + zone de sécurité). À gauche, la quantité dans une pastille dorée ronde ; à droite, le total dans une pilule translucide. Elle « rebondit » légèrement (scale 1.03) à chaque ajout.
- **Barre d'outils collante** (recherche et filtres) : fond `rgba(251,249,245,.9)` + `backdrop-filter: saturate(1.4) blur(14px)`. Un filet n'apparaît qu'une fois la barre collée en haut.
- **Badge « Table 12 »** : petit bloc noir mat au rayon de 14 px, avec « TABLE » en 9 px majuscules espacées au-dessus du numéro en serif de 24 px.
- **Étapes de suivi** : une liste verticale de pastilles de 28 px reliées par un trait de 2 px. Les étapes faites sont noires avec une coche, l'étape en cours « respire » (animation douce).
- **Photo absente** : un dégradé `135deg, var(--sand-2) → var(--sand-3)` avec un grand emoji centré. Jamais d'image cassée visible.

---

## 5. Mise en page

- **Pensé d'abord pour le mobile** : colonne centrale de 680 px maximum pour le client, marges latérales de 16 px.
- **Dashboards** : pleine largeur, contenu jusqu'à 1100 px, grilles `repeat(auto-fit, minmax(170px, 1fr))`.
- **Espacements** sur une échelle de 4 : 4, 6, 8, 10, 12, 14, 16, 20, 24, 32 px. Entre deux cartes : 12 px. Entre deux sections : 24 à 26 px.
- **Zones de sécurité iPhone** respectées (`env(safe-area-inset-bottom)`) pour tout ce qui est fixé en bas.
- **Pas de défilement horizontal de page.** Seules les rangées de pastilles défilent horizontalement.

---

## 6. Mouvement

- **Une seule courbe** : `cubic-bezier(.22, .8, .24, 1)`.
- **Durées** :
  - 150–200 ms pour les survols et les appuis (`scale(.98)`) ;
  - 300–420 ms pour les ouvertures de fenêtres et les apparitions.
- **Apparition des listes** : fondu + translation de 8 px, décalée de 35 ms par élément (400 ms maximum).
- **Nouvel élément important** (nouvelle commande) : entrée en léger zoom, puis halo rouge doux qui pulse jusqu'à ce qu'on le traite.
- **Toujours** respecter `prefers-reduced-motion: reduce`, qui coupe toutes les animations.

---

## 7. Icônes et images

- **Icônes SVG au trait**, `stroke="currentColor"`, épaisseur 1.8 à 2, bouts arrondis (`stroke-linecap/linejoin: round`), 18 px dans les boutons. Pas de pack d'icônes pleines ni colorées.
- **Emojis** possibles en petit, pour l'appétence (🌿 végétarien, 🧾 addition), jamais comme seule information.
- **Photos de plats** en `object-fit: cover`, coins arrondis (12 px en vignette), lumière naturelle, fond neutre.

---

## 8. Ton des textes

- **En français**, avec le **vouvoiement**, des phrases courtes et chaleureuses (« Bienvenue ! », « Bon appétit ! »).
- **Boutons à l'infinitif ou à l'impératif, avec le montant** : « Commander · 24,00 € », « Envoyer en cuisine ».
- **Prix au format français** : `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`, par exemple 1 234,50 €.
- **Messages d'erreur** qui disent quoi faire : « La table 45 n'existe pas ici (tables 1 à 30) ».

---

## 9. Accessibilité

- **Contraste suffisant** : `--ink` et `--ink-2` sur `--sand` ou `--card` pour tout texte. `--muted` est réservé aux textes secondaires.
- **Focus visible** au clavier (`outline: 2px solid var(--ink)`), libellés `aria-label` sur les boutons icônes.
- **Les états ne reposent jamais sur la couleur seule** : badge texte + couleur (« ÉPUISÉ », « PAYÉ »).
- **Cibles tactiles** de 40 px minimum.

---

## 10. À faire et à éviter

| ✅ À faire | ❌ À éviter |
|---|---|
| Fond sable `#FBF9F5`, cartes blanches | Fond blanc pur ou gris froid |
| Boutons pilule noir mat | Boutons carrés, colorés (bleu, vert) ou en dégradé |
| Serif pour les titres, Manrope pour le texte | Une seule police partout, ou Arial/Roboto |
| Filets de 1 px `#E6DFD2` | Bordures épaisses ou noires |
| Ombres très légères, uniquement au survol ou sur les éléments flottants | Ombres portées marquées partout |
| Le doré en touche (1 à 2 éléments par écran) | Doré partout, ou effets « luxe » clinquants |
| Une action principale par écran | Plusieurs boutons noirs côte à côte |
| Fenêtres glissantes depuis le bas sur mobile | Pop-ups centrés qui bloquent sur mobile |
| Animations douces de 200 à 400 ms | Rebonds, rotations, animations longues |
| Grands chiffres en serif à chiffres alignés | Chiffres en gras linéal sans alignement |

---

## 11. Vérifications finales

- [ ] Les variables `:root` de la section 2 sont copiées à l'identique, et aucune autre couleur n'est inventée.
- [ ] Les polices Cormorant Garamond et Manrope sont chargées.
- [ ] Les titres sont en serif 600, le texte en Manrope 15 px.
- [ ] Les boutons sont des pilules d'au moins 48 px, avec une seule action noire mat par écran.
- [ ] Les cartes ont un rayon de 16 px, un filet `--line` et un fond blanc sur page sable.
- [ ] Les fenêtres sont en bottom sheet sur mobile et en modale centrée sur bureau.
- [ ] Toutes les animations utilisent `var(--ease)` et `prefers-reduced-motion` est respecté.
- [ ] L'affichage est testé sur un écran de 390 px de large, sans défilement horizontal.

Référence complète : `css/tapigo.css` dans ce dépôt.
