/* ==========================================================================
   Tapigo — Données de démonstration
   Remplacez ce fichier par un appel API (GET /api/restaurants/:id/menu)
   lors du branchement sur un vrai backend.
   ========================================================================== */
(function () {
  'use strict';

  var IMG = function (id) {
    return 'https://images.unsplash.com/photo-' + id + '?auto=format&fit=crop&w=640&q=70';
  };

  var CUISSON = {
    id: 'cuisson', name: 'Cuisson', type: 'single', required: true,
    choices: [
      { label: 'Bleue', price: 0 },
      { label: 'Saignante', price: 0 },
      { label: 'À point', price: 0 },
      { label: 'Bien cuite', price: 0 }
    ]
  };

  var ACCOMPAGNEMENT = {
    id: 'accompagnement', name: 'Accompagnement', type: 'single', required: true,
    choices: [
      { label: 'Frites maison', price: 0 },
      { label: 'Purée à la truffe', price: 3 },
      { label: 'Salade verte', price: 0 },
      { label: 'Légumes de saison', price: 0 }
    ]
  };

  window.TAPIGO_DEMO = {
    restaurant: {
      id: 'table-de-sable',
      name: 'La Table de Sable',
      tagline: 'Cuisine de saison · Paris 7e',
      tables: 12,
      languages: ['en']
    },

    categories: [
      { id: 'entrees', label: 'Entrées' },
      { id: 'plats', label: 'Plats' },
      { id: 'desserts', label: 'Desserts' },
      { id: 'boissons', label: 'Boissons' }
    ],

    tags: {
      signature: 'Signature',
      veggie: 'Végétarien',
      gf: 'Sans gluten'
    },

    // Les 14 allergènes à déclaration obligatoire (règlement UE INCO n° 1169/2011).
    allergens: [
      { id: 'gluten', label: 'Gluten' },
      { id: 'crustaces', label: 'Crustacés' },
      { id: 'oeufs', label: 'Œufs' },
      { id: 'poissons', label: 'Poissons' },
      { id: 'arachides', label: 'Arachides' },
      { id: 'soja', label: 'Soja' },
      { id: 'lait', label: 'Lait' },
      { id: 'fruits-a-coque', label: 'Fruits à coque' },
      { id: 'celeri', label: 'Céleri' },
      { id: 'moutarde', label: 'Moutarde' },
      { id: 'sesame', label: 'Sésame' },
      { id: 'sulfites', label: 'Sulfites' },
      { id: 'lupin', label: 'Lupin' },
      { id: 'mollusques', label: 'Mollusques' }
    ],

    items: [
      /* ---------- Entrées ---------- */
      {
        id: 'burrata', category: 'entrees', station: 'cuisine', emoji: '🧀',
        name: 'Burrata des Pouilles',
        description: 'Burrata crémeuse, tomates anciennes, basilic frais et huile d’olive vierge extra.',
        price: 14, image: IMG('1546069901-ba9599a7e63c'),
        tags: ['veggie', 'gf'], allergens: 'Lait', available: true, options: []
      },
      {
        id: 'carpaccio', category: 'entrees', station: 'cuisine', emoji: '🥩',
        name: 'Carpaccio de bœuf',
        description: 'Fines tranches de bœuf charolais, copeaux de parmesan, roquette et câpres.',
        price: 15, image: IMG('1544025162-d76694265947'),
        tags: ['gf'], allergens: 'Lait', available: true, options: []
      },
      {
        id: 'veloute', category: 'entrees', station: 'cuisine', emoji: '🎃',
        name: 'Velouté de potimarron',
        description: 'Velouté soyeux, crème de châtaigne et graines torréfiées.',
        price: 11, image: IMG('1547592166-23ac45744acd'),
        tags: ['veggie', 'gf'], allergens: 'Lait', available: true, options: []
      },
      {
        id: 'tartare-saumon', category: 'entrees', station: 'cuisine', emoji: '🐟',
        name: 'Tartare de saumon',
        description: 'Saumon label rouge, avocat, agrumes et sésame noir.',
        price: 16, image: IMG('1512621776951-a57141f2eefd'),
        tags: ['gf'], allergens: 'Poisson, sésame', available: true, options: []
      },

      /* ---------- Plats ---------- */
      {
        id: 'entrecote', category: 'plats', station: 'cuisine', emoji: '🥩',
        name: 'Entrecôte maturée 300 g',
        description: 'Bœuf maturé 30 jours, grillé au feu de bois, fleur de sel de Guérande.',
        price: 32, image: IMG('1600891964092-4316c288032e'),
        tags: ['signature', 'gf'], allergens: '', available: true,
        options: [
          CUISSON,
          ACCOMPAGNEMENT,
          {
            id: 'sauce', name: 'Sauce', type: 'single', required: false,
            choices: [
              { label: 'Poivre vert', price: 0 },
              { label: 'Béarnaise', price: 0 },
              { label: 'Beurre d’échalote', price: 0 }
            ]
          }
        ]
      },
      {
        id: 'burger', category: 'plats', station: 'cuisine', emoji: '🍔',
        name: 'Burger Tapigo',
        description: 'Brioche toastée, bœuf haché minute, comté 18 mois, oignons confits.',
        price: 22, image: IMG('1568901346375-23c9450c58cd'),
        tags: ['signature'], allergens: 'Gluten, lait, œuf', available: true,
        options: [
          CUISSON,
          ACCOMPAGNEMENT,
          {
            id: 'supplements', name: 'Suppléments', type: 'multi', required: false,
            choices: [
              { label: 'Bacon fumé', price: 2 },
              { label: 'Cheddar affiné', price: 1.5 },
              { label: 'Œuf au plat', price: 1.5 }
            ]
          }
        ]
      },
      {
        id: 'risotto', category: 'plats', station: 'cuisine', emoji: '🍄',
        name: 'Risotto aux cèpes',
        description: 'Riz carnaroli, cèpes poêlés, parmesan 24 mois et persil plat.',
        price: 24, image: IMG('1476124369491-e7addf5db371'),
        tags: ['veggie', 'gf'], allergens: 'Lait', available: true,
        options: [
          {
            id: 'truffe', name: 'Supplément', type: 'multi', required: false,
            choices: [{ label: 'Truffe noire râpée', price: 6 }]
          }
        ]
      },
      {
        id: 'dorade', category: 'plats', station: 'cuisine', emoji: '🐠',
        name: 'Dorade royale',
        description: 'Filet snacké, beurre blanc aux agrumes, fenouil rôti.',
        price: 27, image: IMG('1519708227418-c8fd9a32b7a2'),
        tags: ['gf'], allergens: 'Poisson, lait', available: true,
        options: [ACCOMPAGNEMENT]
      },

      /* ---------- Desserts ---------- */
      {
        id: 'fondant', category: 'desserts', station: 'cuisine', emoji: '🍫',
        name: 'Fondant au chocolat',
        description: 'Cœur coulant Guanaja 70 %, servi tiède.',
        price: 10, image: IMG('1606313564200-e75d5e30476c'),
        tags: ['signature', 'veggie'], allergens: 'Gluten, lait, œuf', available: true,
        options: [
          {
            id: 'accomp-dessert', name: 'Accompagnement', type: 'single', required: true,
            choices: [
              { label: 'Glace vanille', price: 0 },
              { label: 'Crème anglaise', price: 0 },
              { label: 'Chantilly maison', price: 0 }
            ]
          }
        ]
      },
      {
        id: 'tarte-citron', category: 'desserts', station: 'cuisine', emoji: '🍋',
        name: 'Tarte citron meringuée',
        description: 'Pâte sablée, crémeux citron de Menton, meringue italienne flambée.',
        price: 9, image: IMG('1519915028121-7d3463d20b13'),
        tags: ['veggie'], allergens: 'Gluten, lait, œuf', available: true, options: []
      },
      {
        id: 'cafe-gourmand', category: 'desserts', station: 'bar', emoji: '☕',
        name: 'Café gourmand',
        description: 'Espresso et trois mignardises du moment.',
        price: 11, image: IMG('1495474472287-4d71bcdd2085'),
        tags: ['veggie'], allergens: 'Gluten, lait, œuf, fruits à coque', alcohol: false, available: false, options: []
      },

      /* ---------- Boissons ---------- */
      {
        id: 'spritz', category: 'boissons', station: 'bar', emoji: '🍹',
        name: 'Spritz maison',
        description: 'Apérol, prosecco, eau pétillante, orange sanguine.',
        price: 12, image: IMG('1514362545857-3bc16c4c7d1b'),
        tags: ['signature'], allergens: 'Sulfites', alcohol: true, available: true, options: []
      },
      {
        id: 'bordeaux', category: 'boissons', station: 'bar', emoji: '🍷',
        name: 'Bordeaux — Saint-Émilion',
        description: 'Château La Rose, millésime 2019. Notes de fruits noirs et de cèdre.',
        price: 9, image: IMG('1510812431401-41d2bd2722f3'),
        tags: [], allergens: 'Sulfites', alcohol: true, available: true,
        options: [
          {
            id: 'contenance', name: 'Contenance', type: 'single', required: true,
            choices: [
              { label: 'Verre 12 cl', price: 0 },
              { label: 'Pichet 46 cl', price: 17 },
              { label: 'Bouteille 75 cl', price: 33 }
            ]
          }
        ]
      },
      {
        id: 'citronnade', category: 'boissons', station: 'bar', emoji: '🍋',
        name: 'Citronnade maison',
        description: 'Citron pressé, menthe fraîche, sirop d’agave.',
        price: 6, image: IMG('1621263764928-df1444c5e859'),
        tags: ['veggie', 'gf'], allergens: '', alcohol: false, available: true, options: []
      },
      {
        id: 'eau', category: 'boissons', station: 'bar', emoji: '💧',
        name: 'Eau minérale 75 cl',
        description: 'Fraîche, servie en carafe de verre.',
        price: 5, image: IMG('1523362628745-0c100150b504'),
        tags: ['veggie', 'gf'], allergens: '', alcohol: false, available: true,
        options: [
          {
            id: 'eau-type', name: 'Type', type: 'single', required: true,
            choices: [{ label: 'Plate', price: 0 }, { label: 'Pétillante', price: 0 }]
          }
        ]
      },
      {
        id: 'espresso', category: 'boissons', station: 'bar', emoji: '☕',
        name: 'Espresso',
        description: 'Torréfaction artisanale, origine Éthiopie.',
        price: 3, image: IMG('1510591509098-f4fdc6d0ff04'),
        tags: ['veggie', 'gf'], allergens: '', alcohol: false, available: true, options: []
      }
    ]
  };

  // Suggestions « Parfait avec » de la carte de démonstration.
  var PAIRINGS = {
    entrecote: ['bordeaux'], burger: ['citronnade'], risotto: ['bordeaux'],
    burrata: ['spritz'], fondant: ['espresso'], 'tarte-citron': ['espresso'], dorade: ['bordeaux']
  };
  window.TAPIGO_DEMO.items.forEach(function (i) { if (PAIRINGS[i.id]) i.pairings = PAIRINGS[i.id]; });

  // Carte de démonstration traduite en anglais (en ligne, la traduction est faite par l'IA).
  var EN = {
    burrata: ['Burrata from Puglia', 'Creamy burrata, heirloom tomatoes, fresh basil and extra virgin olive oil.'],
    carpaccio: ['Beef carpaccio', 'Thin slices of Charolais beef, parmesan shavings, rocket and capers.'],
    veloute: ['Red kuri squash velouté', 'Silky velouté, chestnut cream and toasted seeds.'],
    'tartare-saumon': ['Salmon tartare', 'Label Rouge salmon, avocado, citrus and black sesame.'],
    entrecote: ['Dry-aged rib-eye steak 300 g', 'Beef aged 30 days, grilled over a wood fire, Guérande fleur de sel.'],
    burger: ['Tapigo burger', 'Toasted brioche, freshly minced beef, 18-month Comté, caramelised onions.'],
    risotto: ['Porcini risotto', 'Carnaroli rice, pan-fried porcini, 24-month parmesan and flat-leaf parsley.'],
    dorade: ['Royal sea bream', 'Seared fillet, citrus beurre blanc, roasted fennel.'],
    fondant: ['Chocolate fondant', 'Molten Guanaja 70 % centre, served warm.'],
    'tarte-citron': ['Lemon meringue tart', 'Shortcrust pastry, Menton lemon cream, flamed Italian meringue.'],
    'cafe-gourmand': ['Café gourmand', 'Espresso with three small sweets of the moment.'],
    spritz: ['House spritz', 'Aperol, prosecco, sparkling water, blood orange.'],
    bordeaux: ['Bordeaux — Saint-Émilion', 'Château La Rose, 2019 vintage. Notes of black fruit and cedar.'],
    citronnade: ['Homemade lemonade', 'Freshly squeezed lemon, fresh mint, agave syrup.'],
    eau: ['Mineral water 75 cl', 'Chilled, served in a glass carafe.'],
    espresso: ['Espresso', 'Artisan roast, Ethiopian origin.']
  };
  var items = {};
  window.TAPIGO_DEMO.items.forEach(function (i) {
    if (EN[i.id]) items[i.id] = { name: EN[i.id][0], description: EN[i.id][1], src: i.name + '\n' + (i.description || '') };
  });
  window.TAPIGO_DEMO.i18n = {
    en: {
      items: items,
      cats: { 'Entrées': 'Starters', 'Plats': 'Mains', 'Desserts': 'Desserts', 'Boissons': 'Drinks' },
      tags: { 'Signature': 'Signature', 'Végétarien': 'Vegetarian', 'Sans gluten': 'Gluten-free' },
      groups: { 'Cuisson': 'Cooking', 'Accompagnement': 'Side', 'Sauce': 'Sauce', 'Suppléments': 'Extras', 'Supplément': 'Extra',
        'Contenance': 'Size', 'Type': 'Type' },
      choices: { 'Bleue': 'Blue', 'Saignante': 'Rare', 'À point': 'Medium', 'Bien cuite': 'Well done',
        'Frites maison': 'Homemade fries', 'Purée à la truffe': 'Truffle mash', 'Salade verte': 'Green salad', 'Légumes de saison': 'Seasonal vegetables',
        'Poivre vert': 'Green peppercorn', 'Béarnaise': 'Béarnaise', 'Beurre d’échalote': 'Shallot butter',
        'Bacon fumé': 'Smoked bacon', 'Cheddar affiné': 'Aged cheddar', 'Œuf au plat': 'Fried egg', 'Truffe noire râpée': 'Grated black truffle',
        'Glace vanille': 'Vanilla ice cream', 'Crème anglaise': 'Custard', 'Chantilly maison': 'Homemade whipped cream',
        'Verre 12 cl': 'Glass 12 cl', 'Pichet 46 cl': 'Carafe 46 cl', 'Bouteille 75 cl': 'Bottle 75 cl', 'Plate': 'Still', 'Pétillante': 'Sparkling' },
      tagline: { src: 'Cuisine de saison · Paris 7e', text: 'Seasonal cooking · Paris 7th' }
    }
  };
})();
