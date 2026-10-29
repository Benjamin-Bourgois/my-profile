/* ==========================================================================
   Tapigo — Fiches techniques et marges (gérant)
   Coût de revient de chaque produit de la carte (recette d'ingrédients, ou
   produit acheté tel quel), marge HT, ratio matière, marge brute des 30
   derniers jours et alertes de hausse des prix d'achat. Les prix d'achat
   viennent des bons de livraison scannés, ou d'une saisie du gérant.
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc, fmt = T.fmt, I = UI.ICONS;
  var UNIT_PRICE = { kg: '€ / kg', l: '€ / L', piece: '€ / pièce' };
  var UNIT_NAME = { kg: 'kg', l: 'L', piece: 'pièce' };
  var QTY_UNITS = { kg: ['g', 'kg'], l: ['cl', 'l'], piece: ['piece'] };
  var QTY_LABEL = { g: 'g', kg: 'kg', cl: 'cl', l: 'L', piece: 'pièce(s)' };
  var VATS = [5.5, 10, 20];
  var RISE = 0.03;            // hausse signalée au-delà de 3 %
  var RISE_DAYS = 60;         // … si le nouveau prix date de moins de 60 jours
  var GOOD = 0.25, WARN = 0.35; // ratio matière : vert < 25 %, orange < 35 %, rouge au-delà

  var state = { data: null, error: '', sales: null, q: '' };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function pct(r) { return (Math.round(r * 1000) / 10).toLocaleString('fr-FR') + ' %'; }
  function euro4(v) { return (Math.round(v * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

  // Quantité de recette ramenée à l'unité de prix de l'ingrédient (g -> kg, cl -> L).
  function toBase(qty, unit) { return unit === 'g' ? qty / 1000 : unit === 'cl' ? qty / 100 : qty; }

  function ingredient(id) { return state.data.ingredients.filter(function (i) { return i.id === id; })[0]; }

  // TVA sur place : 20 % si le produit contient de l'alcool, 10 % sinon (case « Contient de l'alcool » du Menu).
  function vatFixed(item) { return item.alcohol === true ? 20 : item.alcohol === false ? 10 : null; }
  // Produit pas encore renseigné : taux de sa fiche, sinon estimation (bar = 20 %, cuisine = 10 %).
  function vatOf(item) {
    var f = vatFixed(item), r = state.data.recipes[item.id];
    return f != null ? f : r ? r.vat : item.station === 'bar' ? 20 : 10;
  }

  function linesCost(lines) {
    var cost = 0, complete = true;
    (lines || []).forEach(function (l) {
      var ing = ingredient(l.ingredientId);
      if (!ing || ing.cost == null) { complete = false; return; }
      cost += ing.cost * toBase(l.qty, l.unit);
    });
    return { cost: cost, complete: complete };
  }

  // Coût ajouté par un choix d'option (ex. « Suppléments » → « Bacon fumé »), null s'il n'est pas chiffré.
  function optionCost(itemId, group, choice) {
    var r = state.data.recipes[itemId];
    var o = r && (r.options || []).filter(function (x) { return x.group === group && x.choice === choice; })[0];
    return o ? linesCost(o.lines).cost : null;
  }

  // Coût d'une portion : { cost, complete, mode, source }.
  function itemCost(item) {
    var r = state.data.recipes[item.id];
    if (r && r.mode === 'recette' && r.lines.length) {
      var c = linesCost(r.lines);
      return { cost: c.cost, complete: c.complete, mode: 'recette', source: 'Recette' };
    }
    var bought = r && r.mode === 'achat' && r.purchaseCost != null ? r.purchaseCost : state.data.itemCosts[item.id];
    if (bought != null) return { cost: bought, complete: true, mode: 'achat', source: r && r.purchaseCost != null ? 'Acheté tel quel' : 'Relevé sur un bon' };
    return null;
  }

  function analyse(item) {
    var r = state.data.recipes[item.id];
    var vat = vatOf(item), guess = vatFixed(item) == null && !r;
    var ht = item.price / (1 + vat / 100);
    var c = itemCost(item);
    var opts = r && (r.options || []).length;
    if (!c) return { item: item, vat: vat, vatGuess: guess, ht: ht, cost: null };
    return { item: item, vat: vat, vatGuess: guess, ht: ht, cost: c.cost, complete: c.complete, source: c.source, opts: opts,
      margin: ht - c.cost, ratio: ht > 0 ? c.cost / ht : null };
  }

  // Hausses récentes des prix d'achat, avec les produits touchés.
  function rises(rows) {
    var since = Date.now() - RISE_DAYS * 86400000;
    return state.data.ingredients.filter(function (i) {
      return i.cost != null && i.prevCost != null && i.prevCost > 0 && i.cost > i.prevCost * (1 + RISE) && (i.costUpdatedAt || 0) >= since;
    }).map(function (i) {
      var hit = [];
      rows.forEach(function (a) {
        var r = state.data.recipes[a.item.id];
        if (!r) return;
        var uses = function (lines, name) {
          (lines || []).forEach(function (l) {
            if (l.ingredientId === i.id) hit.push({ name: name, delta: (i.cost - i.prevCost) * toBase(l.qty, l.unit) });
          });
        };
        if (r.mode === 'recette') uses(r.lines, a.item.name);
        (r.options || []).forEach(function (o) { uses(o.lines, a.item.name + ' (' + o.choice + ')'); });
      });
      return { ing: i, change: (i.cost - i.prevCost) / i.prevCost, items: hit };
    }).sort(function (a, b) { return b.change - a.change; });
  }

  function ratioBadge(r) {
    if (r == null) return '<span class="badge">—</span>';
    return '<span class="badge ' + (r < GOOD ? 'badge--ok' : r < WARN ? 'badge--warn' : 'badge--danger') + '">' + pct(r) + '</span>';
  }

  function tile(label, value, sub) {
    return '<div class="stat-tile"><span>' + esc(label) + '</span><b>' + value + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  /* ---------------- Page ---------------- */
  function render(root) {
    if (!state.data && !state.error) {
      root.innerHTML = '<div class="empty"><span class="spinner" style="display:inline-block;border-color:var(--line);border-top-color:var(--ink)"></span><p style="margin-top:10px">Calcul des marges…</p></div>';
      return load(root);
    }
    if (state.error) {
      root.innerHTML = '<div class="empty"><h3>Marges indisponibles</h3><p>' + esc(state.error) + '</p></div>';
      return;
    }
    var menu = T.getMenu();
    var rows = menu.items.map(analyse);
    var costed = rows.filter(function (a) { return a.cost != null; });
    var missing = rows.length - costed.length;

    // Ventes des 30 derniers jours, ligne par ligne (prix payé et options choisies) :
    // ratio matière pondéré et marge brute.
    var byId = {};
    rows.forEach(function (a) { byId[a.item.id] = a; });
    var htSold = 0, costSold = 0, coveredQty = 0, totalQty = 0;
    (state.sales || []).forEach(function (l) {
      var a = byId[l.itemId];
      totalQty += l.qty;
      if (!a || a.cost == null) return;
      var cost = a.cost;
      (l.options || []).forEach(function (op) {
        (op.values || []).forEach(function (v) { cost += optionCost(a.item.id, op.group, v) || 0; });
      });
      htSold += (l.unitPrice != null ? l.unitPrice : a.item.price) / (1 + a.vat / 100) * l.qty;
      costSold += cost * l.qty; coveredQty += l.qty;
    });
    var marginSold = htSold - costSold;
    var weighted = htSold > 0 ? costSold / htSold : null;
    var up = rises(rows);
    var q = state.q.trim().toLowerCase();
    var shown = rows.filter(function (a) { return !q || a.item.name.toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return (b.ratio == null ? -1 : b.ratio) - (a.ratio == null ? -1 : a.ratio); });

    root.innerHTML = '<div class="editor margins">' +
      '<div class="stat-tiles">' +
        tile('Ratio matière', weighted == null ? '—' : pct(weighted), weighted == null ? 'pas encore de ventes chiffrées' : 'coût / prix HT, pondéré par les ventes des 30 derniers jours') +
        tile('Marge brute 30 jours', state.sales ? fmt(marginSold) : '…', state.sales ? (totalQty ? Math.round(coveredQty / totalQty * 100) + ' % des ventes chiffrées' : 'aucune vente sur la période') : 'chargement des ventes') +
        tile('Produits sans fiche', String(missing), missing ? 'coût inconnu : touchez « Fiche »' : 'toute la carte est chiffrée') +
        tile('Hausses de prix', String(up.length), up.length ? 'sur les ' + RISE_DAYS + ' derniers jours' : 'aucune hausse récente') +
      '</div>' +
      (up.length ? '<section class="forecast"><div class="forecast__head"><div><p class="eyebrow">' + I.bolt.replace('<svg ', '<svg width="14" height="14" ') + ' Prix d’achat</p><h2>Hausses récentes</h2></div></div>' +
        '<div class="forecast__list">' + up.map(function (u) {
          return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(u.ing.name) + '</strong><small>' +
            euro4(u.ing.prevCost) + ' → ' + euro4(u.ing.cost) + ' ' + UNIT_PRICE[u.ing.unit].replace('€ ', '') +
            (u.items.length ? ' · ' + u.items.map(function (x) { return esc(x.name) + ' +' + euro4(x.delta) + ' par portion'; }).join(', ') : ' · utilisé dans aucune fiche') +
            '</small></div><span class="badge badge--danger">+' + pct(u.change) + '</span></div>';
        }).join('') + '</div></section>' : '') +
      '<label class="search">' + I.search + '<input id="marginSearch" type="search" placeholder="Rechercher un produit…" value="' + esc(state.q) + '" aria-label="Rechercher un produit"></label>' +
      '<section class="chart-card"><h3>Coût et marge par produit</h3><div style="overflow-x:auto"><table class="loss-table margin-table"><thead><tr>' +
        '<th>Produit</th><th>Prix TTC</th><th>TVA</th><th>Coût portion</th><th>Marge HT</th><th>Ratio matière</th><th></th></tr></thead><tbody>' +
        shown.map(function (a) {
          var src = [a.source, a.complete === false ? 'prix manquant' : '', a.opts ? 'options chiffrées' : ''].filter(Boolean).join(' · ');
          return '<tr><td><strong>' + esc(a.item.name) + '</strong>' + (src ? '<small class="margin-src">' + esc(src) + '</small>' : '') + '</td>' +
            '<td>' + fmt(a.item.price) + '</td><td>' + String(a.vat).replace('.', ',') + ' %' +
              (a.vatGuess ? '<small class="margin-src" title="Cochez ou non « Contient de l’alcool » dans l’onglet Menu">à vérifier</small>' : '') + '</td>' +
            '<td>' + (a.cost == null ? '—' : euro4(a.cost)) + '</td>' +
            '<td>' + (a.cost == null ? '—' : '<strong>' + fmt(a.margin) + '</strong>') + '</td>' +
            '<td>' + ratioBadge(a.ratio) + '</td>' +
            '<td><button class="btn btn--soft btn--sm" type="button" data-recipe="' + esc(a.item.id) + '">' + (a.cost == null ? 'Créer la fiche' : 'Fiche') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="help">Ratio matière = coût d’une portion ÷ prix de vente HT. Repères : moins de 25 % (vert), 25 à 35 % (orange), au-delà (rouge). ' +
          'La marge brute tient compte du prix payé et du coût des options choisies (à chiffrer dans chaque fiche). ' +
          'TVA sur place : 20 % pour un produit avec alcool, 10 % sinon (case « Contient de l’alcool » de l’onglet Menu).</p></section>' +
      '<section class="chart-card"><div class="margins-head"><h3>Ingrédients et prix d’achat</h3>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-ing-new>+ Ingrédient</button></div>' +
        (state.data.ingredients.length
          ? '<div style="overflow-x:auto"><table class="loss-table"><thead><tr><th>Ingrédient</th><th>Prix d’achat HT</th><th>Mis à jour</th><th></th></tr></thead><tbody>' +
              state.data.ingredients.map(function (i) {
                return '<tr><td><strong>' + esc(i.name) + '</strong></td>' +
                  '<td>' + (i.cost == null ? '<span class="badge badge--warn">à saisir</span>' : euro4(i.cost) + ' ' + UNIT_PRICE[i.unit].replace('€ ', '')) + '</td>' +
                  '<td>' + (i.costUpdatedAt ? esc(new Date(i.costUpdatedAt).toLocaleDateString('fr-FR')) + ' · ' + (i.source === 'bon' ? 'bon de livraison' : 'saisie') : '—') + '</td>' +
                  '<td><button class="link-btn" type="button" data-ing-edit="' + esc(i.id) + '">Modifier</button></td></tr>';
              }).join('') + '</tbody></table></div>'
          : '<p class="help">Aucun ingrédient pour l’instant. Scannez un bon de livraison (onglet Stocks) : chaque ligne chiffrée devient un ingrédient avec son prix. Vous pouvez aussi en ajouter à la main.</p>') +
      '</section>' +
    '</div>';
  }

  function load(root) {
    T.margins.load().then(function (d) { state.data = d; state.error = ''; }, function (err) { state.error = err.message; })
      .then(function () { render(root); });
    // Quantités vendues par produit sur 30 jours (marge brute, ratio pondéré).
    T.loadStats(30).then(function (orders) {
      state.sales = [].concat.apply([], orders.map(function (o) { return o.lines || []; }));
      if (state.data) render(root);
    }, function () { state.sales = []; });
  }

  /* ---------------- Fiche technique ---------------- */
  function openRecipe(root, itemId, keep) {
    var item = T.getItem(itemId);
    if (!item) return;
    var r = state.data.recipes[itemId];
    var fixedVat = vatFixed(item);
    // Tous les choix d'options du produit, dans l'ordre de la carte.
    var optList = [];
    (item.options || []).forEach(function (g) {
      (g.choices || []).forEach(function (c) { optList.push({ group: g.name, choice: c.label, price: Number(c.price) || 0 }); });
    });
    var draft = keep || {
      mode: r ? r.mode : (state.data.itemCosts[itemId] != null ? 'achat' : 'recette'),
      vat: vatOf(item),
      lines: r ? r.lines.map(function (l) { return { ingredientId: l.ingredientId, qty: l.qty, unit: l.unit }; }) : [],
      purchaseCost: r && r.purchaseCost != null ? r.purchaseCost : (state.data.itemCosts[itemId] != null ? Math.round(state.data.itemCosts[itemId] * 100) / 100 : null),
      options: optList.map(function (o) {
        var saved = r && (r.options || []).filter(function (x) { return x.group === o.group && x.choice === o.choice; })[0];
        return saved ? saved.lines.map(function (l) { return { ingredientId: l.ingredientId, qty: l.qty, unit: l.unit }; }) : [];
      })
    };
    var vat = function () { return fixedVat != null ? fixedVat : draft.vat; };
    // key : 'main' (recette) ou le numéro du choix d'option.
    var linesOf = function (key) { return key === 'main' ? draft.lines : draft.options[+key]; };

    function lineCost(l) {
      var ing = ingredient(l.ingredientId);
      return ing && ing.cost != null && l.qty > 0 ? ing.cost * toBase(l.qty, l.unit) : null;
    }
    function sum(lines) { return lines.reduce(function (s, l) { var c = lineCost(l); return c == null ? s : s + c; }, 0); }
    function total() { return draft.mode === 'achat' ? draft.purchaseCost : sum(draft.lines); }

    function lineHTML(l, key, i) {
      var ing = ingredient(l.ingredientId), c = lineCost(l);
      return '<div class="recipe-line" data-key="' + key + '" data-line="' + i + '">' +
        '<select data-line-ing aria-label="Ingrédient">' + state.data.ingredients.map(function (x) {
          return '<option value="' + esc(x.id) + '"' + (x.id === l.ingredientId ? ' selected' : '') + '>' + esc(x.name) + '</option>';
        }).join('') + '</select>' +
        '<input data-line-qty type="number" min="0" step="any" inputmode="decimal" value="' + (l.qty || '') + '" aria-label="Quantité">' +
        '<select data-line-unit aria-label="Unité">' + (QTY_UNITS[ing ? ing.unit : 'piece'] || ['piece']).map(function (u) {
          return '<option value="' + u + '"' + (u === l.unit ? ' selected' : '') + '>' + QTY_LABEL[u] + '</option>';
        }).join('') + '</select>' +
        '<span class="recipe-line__cost">' + (c == null ? (ing && ing.cost == null ? 'prix ?' : '—') : euro4(c)) + '</span>' +
        '<button class="icon-btn" type="button" data-line-del aria-label="Retirer">' + I.close + '</button></div>';
    }

    function addButtons(key, label) {
      return '<div class="recipe-add">' +
        (state.data.ingredients.length ? '<button class="btn btn--ghost btn--sm" type="button" data-line-add="' + key + '">+ ' + label + '</button>' : '') +
        '<button class="btn btn--ghost btn--sm" type="button" data-line-new="' + key + '">+ Nouvel ingrédient</button></div>';
    }

    function optionsHTML() {
      if (!optList.length) return '';
      var ht = 1 + vat() / 100, last = null;
      return '<div class="recipe-opts"><h3>Options et suppléments</h3>' +
        '<p class="help">Ce qu’un choix ajoute à la portion (ex. bacon : 40 g). Son coût s’ajoute à celui de la fiche quand le client le choisit. ' +
          'Laissez vide un choix qui ne coûte rien de plus ; mettez dans la fiche seulement ce qui est toujours servi.</p>' +
        optList.map(function (o, k) {
          var lines = draft.options[k], c = lines.length ? sum(lines) : null;
          var head = o.group !== last ? '<p class="recipe-opts__group">' + esc(o.group) + '</p>' : '';
          last = o.group;
          return head + '<div class="recipe-opt">' +
            '<div class="recipe-opt__head"><strong>' + esc(o.choice) + '</strong>' +
              '<span>' + (o.price ? '+' + fmt(o.price) : 'sans supplément') + '</span>' +
              '<span class="recipe-opt__cost">' + (c == null ? 'pas de coût' : 'coût ' + euro4(c) + (o.price ? ' · marge ' + fmt(o.price / ht - c) : '')) + '</span></div>' +
            lines.map(function (l, i) { return lineHTML(l, k, i); }).join('') +
            addButtons(k, 'Ingrédient') + '</div>';
        }).join('') + '</div>';
    }

    function bodyHTML() {
      var ht = item.price / (1 + vat() / 100), cost = total();
      return '<div class="seg" role="group" aria-label="Type de fiche" style="margin-bottom:12px">' +
          '<button type="button" data-mode="recette" aria-pressed="' + (draft.mode === 'recette') + '">Recette</button>' +
          '<button type="button" data-mode="achat" aria-pressed="' + (draft.mode === 'achat') + '">Acheté tel quel</button></div>' +
        '<div class="form-grid">' +
          (fixedVat != null
            ? '<div class="field"><span>TVA sur place</span><p class="margin-price">' + fixedVat + ' %</p><small class="help">' +
                (item.alcohol ? 'Contient de l’alcool' : 'Sans alcool') + ' (réglé dans l’onglet Menu)</small></div>'
            : '<label class="field"><span>TVA sur place</span><select data-vat>' + VATS.map(function (v) {
                return '<option value="' + v + '"' + (v === draft.vat ? ' selected' : '') + '>' + String(v).replace('.', ',') + ' %</option>';
              }).join('') + '</select><small class="help">10 % : plats et boissons sans alcool · 20 % : alcool. Cochez « Contient de l’alcool » dans l’onglet Menu pour ne plus avoir à choisir.</small></label>') +
          '<div class="field"><span>Prix de vente</span><p class="margin-price">' + fmt(item.price) + ' TTC · ' + fmt(ht) + ' HT</p></div>' +
        '</div>' +
        (draft.mode === 'achat'
          ? '<label class="field" style="margin-top:12px"><span>Coût d’achat HT d’une portion</span><input data-purchase type="number" min="0" step="0.01" inputmode="decimal" value="' + (draft.purchaseCost == null ? '' : draft.purchaseCost) + '" placeholder="Ex : 2,85">' +
              '<small class="help">Relevé automatiquement sur les bons scannés quand le produit est livré tel quel.</small></label>'
          : '<div class="recipe-lines">' + (draft.lines.length ? draft.lines.map(function (l, i) { return lineHTML(l, 'main', i); }).join('')
              : '<p class="help">Ajoutez les ingrédients d’une portion, avec leur quantité.</p>') + '</div>' +
            addButtons('main', 'Ingrédient de la liste')) +
        '<div class="recipe-total">' +
          '<div><span>Coût d’une portion' + (optList.length ? ' (sans option)' : '') + '</span><b>' + (cost == null ? '—' : euro4(cost)) + '</b></div>' +
          '<div><span>Marge HT</span><b>' + (cost == null ? '—' : fmt(ht - cost)) + '</b></div>' +
          '<div><span>Ratio matière</span><b>' + (cost == null || !ht ? '—' : ratioBadge(cost / ht)) + '</b></div>' +
        '</div>' +
        optionsHTML();
    }

    UI.openSheet({
      label: 'Fiche technique',
      head: '<p class="eyebrow">Fiche technique</p><h2>' + esc(item.name) + '</h2>',
      body: '<div id="recipeBody">' + bodyHTML() + '</div>',
      footer: '<button class="btn btn--primary" type="button" id="recipeSave">Enregistrer la fiche</button>',
      onMount: function (sheet) {
        var box = $('#recipeBody', sheet);
        var paint = function () { box.innerHTML = bodyHTML(); };
        box.addEventListener('click', function (e) {
          var m = e.target.closest('[data-mode]');
          if (m) { draft.mode = m.dataset.mode; return paint(); }
          var add = e.target.closest('[data-line-add]');
          if (add) {
            var first = state.data.ingredients[0];
            linesOf(add.dataset.lineAdd).push({ ingredientId: first.id, qty: null, unit: QTY_UNITS[first.unit][0] });
            return paint();
          }
          // Après la création d'un ingrédient, la fiche se rouvre avec le brouillon en cours.
          var created = e.target.closest('[data-line-new]');
          if (created) {
            var key = created.dataset.lineNew;
            return openIngredient(null, function (ing) {
              linesOf(key).push({ ingredientId: ing.id, qty: null, unit: QTY_UNITS[ing.unit][0] });
              openRecipe(root, itemId, draft);
            });
          }
          var del = e.target.closest('[data-line-del]');
          if (del) {
            var row = del.closest('[data-line]');
            linesOf(row.dataset.key).splice(+row.dataset.line, 1);
            return paint();
          }
        });
        box.addEventListener('change', function (e) {
          if (e.target.matches('[data-vat]')) { draft.vat = num(e.target.value); return paint(); }
          if (e.target.matches('[data-purchase]')) { draft.purchaseCost = num(e.target.value); return paint(); }
          var row = e.target.closest('[data-line]');
          if (!row) return;
          var l = linesOf(row.dataset.key)[+row.dataset.line];
          if (e.target.matches('[data-line-ing]')) { l.ingredientId = e.target.value; var ing = ingredient(l.ingredientId); l.unit = QTY_UNITS[ing.unit][0]; }
          if (e.target.matches('[data-line-qty]')) l.qty = num(e.target.value);
          if (e.target.matches('[data-line-unit]')) l.unit = e.target.value;
          paint();
        });
        $('#recipeSave', sheet).addEventListener('click', function (e) {
          var filled = function (lines) { return lines.filter(function (l) { return l.qty > 0; }); };
          var lines = draft.mode === 'recette' ? filled(draft.lines) : [];
          if (draft.mode === 'recette' && !lines.length) return UI.toast('Ajoutez au moins un ingrédient avec sa quantité');
          if (draft.mode === 'achat' && !(draft.purchaseCost >= 0)) return UI.toast('Indiquez le coût d’une portion');
          var options = optList.map(function (o, k) { return { group: o.group, choice: o.choice, lines: filled(draft.options[k]) }; })
            .filter(function (o) { return o.lines.length; });
          var purchase = draft.mode === 'achat' ? draft.purchaseCost : null;
          e.target.disabled = true;
          T.margins.saveRecipe(itemId, draft.mode, vat(), lines, purchase, options).then(function () {
            state.data.recipes[itemId] = { mode: draft.mode, vat: vat(), lines: lines, purchaseCost: purchase, options: options };
            UI.closeSheet();
            UI.toast('Fiche de <strong>' + esc(item.name) + '</strong> enregistrée');
            render(root);
          }, function (err) { e.target.disabled = false; UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  /* ---------------- Ingrédient ---------------- */
  function openIngredient(id, done) {
    var ing = id ? ingredient(id) : null;
    UI.openSheet({
      label: 'Ingrédient',
      head: '<p class="eyebrow">Prix d’achat</p><h2>' + (ing ? esc(ing.name) : 'Nouvel ingrédient') + '</h2>',
      body: '<form id="ingForm" class="form-grid" novalidate>' +
        '<label class="field span-2"><span>Nom</span><input name="name" maxlength="80" value="' + esc(ing ? ing.name : '') + '" placeholder="Ex : Prosecco, bœuf haché, citrons" autofocus></label>' +
        '<label class="field"><span>Acheté au</span><select name="unit">' + ['kg', 'l', 'piece'].map(function (u) {
          return '<option value="' + u + '"' + ((ing ? ing.unit : 'kg') === u ? ' selected' : '') + '>' + (u === 'piece' ? 'à la pièce' : u === 'l' ? 'litre' : 'kilo') + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field"><span>Prix d’achat HT</span><input name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="' + (ing && ing.cost != null ? Math.round(ing.cost * 100) / 100 : '') + '" placeholder="€ par unité"></label>' +
        (ing ? '<p class="help span-2">Le prix est mis à jour tout seul à chaque bon de livraison scanné qui contient cet ingrédient.</p>' : '') +
      '</form>',
      footer: (ing ? '<button class="btn btn--danger" type="button" id="ingDelete">Supprimer</button>' : '') +
        '<button class="btn btn--primary" type="submit" form="ingForm">Enregistrer</button>',
      onMount: function (sheet) {
        var form = $('#ingForm', sheet);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var f = form.elements, name = f.name.value.trim();
          if (!name) return UI.toast('Indiquez le nom');
          T.margins.saveIngredient(ing ? ing.id : null, name, f.unit.value, num(f.cost.value)).then(function (row) {
            var saved = { id: row.id, name: row.name, unit: row.unit, cost: row.cost == null ? null : Number(row.cost),
              prevCost: row.prev_cost == null ? (row.prevCost == null ? null : row.prevCost) : Number(row.prev_cost),
              costUpdatedAt: row.cost_updated_at ? Date.parse(row.cost_updated_at) : (row.costUpdatedAt || Date.now()), source: row.source || 'manuel' };
            state.data.ingredients = state.data.ingredients.filter(function (x) { return x.id !== saved.id; }).concat([saved])
              .sort(function (a, b) { return a.name.localeCompare(b.name, 'fr'); });
            UI.closeSheet().then(function () { if (done) done(saved); else rerender(); });
            UI.toast('Ingrédient enregistré');
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
        var del = $('#ingDelete', sheet);
        if (del) del.addEventListener('click', function () {
          if (!confirm('Supprimer « ' + ing.name + ' » ?')) return;
          T.margins.deleteIngredient(ing.id).then(function () {
            state.data.ingredients = state.data.ingredients.filter(function (x) { return x.id !== ing.id; });
            UI.closeSheet(); UI.toast('Ingrédient supprimé'); rerender();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  var currentRoot = null;
  function rerender() { if (currentRoot) render(currentRoot); }

  function mount(root) {
    if (currentRoot !== root) {
      currentRoot = root;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('[data-recipe]');
        if (b) return openRecipe(root, b.dataset.recipe);
        if (e.target.closest('[data-ing-new]')) return openIngredient(null);
        var ed = e.target.closest('[data-ing-edit]');
        if (ed) return openIngredient(ed.dataset.ingEdit);
      });
      root.addEventListener('input', function (e) {
        if (e.target.id !== 'marginSearch') return;
        state.q = e.target.value;
        var caret = e.target.selectionStart;
        render(root);
        var s = $('#marginSearch', root); s.focus(); s.setSelectionRange(caret, caret);
      });
    }
    // Recharge à chaque ouverture de l'onglet (prix mis à jour par un bon entre-temps).
    state.data = null; state.error = ''; state.sales = null;
    render(root);
  }

  window.TapigoMargins = { mount: mount };
})();
