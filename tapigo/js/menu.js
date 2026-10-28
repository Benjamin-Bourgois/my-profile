/* ==========================================================================
   Tapigo — Interface client (menu.html?table=X)
   Menu interactif · fiche produit · panier · paiement · suivi temps réel
   ========================================================================== */
(function () {
  'use strict';

  var T = Tapigo, UI = TapigoUI, I = UI.ICONS, esc = T.esc, fmt = T.fmt;
  var LIVE = T.mode === 'live';
  var $ = function (s, root) { return (root || document).querySelector(s); };

  /* ---------------- Table détectée depuis l'URL NFC ---------------- */
  var params = new URLSearchParams(location.search);
  var table = (params.get('table') || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 6) || null;
  var slug = (params.get('r') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || null;
  var scope = slug || 'default';
  var CART_KEY = 'tapigo.v1.cart.' + scope;
  var NOTE_KEY = 'tapigo.v1.cartnote.' + scope;
  var MINE_KEY = 'tapigo.v1.mine.' + scope;

  var state = {
    restaurant: T.getRestaurant(),
    menu: T.getMenu(),
    cat: 'all',
    tags: [],
    q: '',
    cart: T.read(CART_KEY, []),
    note: T.read(NOTE_KEY, ''),
    mine: T.read(MINE_KEY, []),
    trackingId: null,
    tip: { mode: 'none', pct: 0, amount: 0 },
    payMethod: LIVE ? 'onsite' : 'applepay'
  };

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* ======================================================================
     En-tête
     ====================================================================== */
  function renderHeader() {
    var r = state.restaurant;
    $('#rName').textContent = r.name;
    $('#rTagline').textContent = r.tagline || '';
    $('#rLogo').textContent = (r.logoLetter || r.name || 'T').trim().charAt(0).toUpperCase();
    document.title = r.name + (table ? ' · Table ' + table : '') + ' · Menu';

    var badge = $('#tableBadge');
    badge.className = 'table-badge' + (table ? '' : ' table-badge--missing');
    badge.innerHTML = '<small>Table</small><b>' + (table ? esc(table) : '—') + '</b>';
    badge.setAttribute('aria-label', table ? 'Table ' + table + ', modifier' : 'Indiquer votre numéro de table');

    var pause = $('#pauseBanner');
    pause.hidden = !r.ordersPaused;
    pause.innerHTML = '<strong>Commandes en ligne en pause.</strong> Le restaurant est très sollicité : adressez-vous au serveur ou réessayez dans quelques minutes.';

    var server = table && T.getTableServer ? T.getTableServer(table) : '';
    $('#welcome').innerHTML = I.nfc + (table
      ? '<p><strong>Bienvenue !</strong> Vous êtes installé·e à la <strong>table ' + esc(table) + '</strong>' +
        (server ? ', servie par <strong>' + esc(server) + '</strong>' : '') +
        '. Composez votre commande : elle part directement en cuisine. ' +
        '<button class="link-btn" type="button" data-change-table>Changer de table</button></p>'
      : '<p><strong>Bienvenue !</strong> Indiquez votre numéro de table pour pouvoir commander. ' +
        '<button class="link-btn" type="button" data-change-table>Indiquer ma table</button></p>');
  }

  /* ======================================================================
     Numéro de table saisi par le client (une seule plaque NFC par restaurant)
     ====================================================================== */
  function tableCount() { return Math.max(1, parseInt(state.restaurant.tables, 10) || 12); }

  // Renvoie un message d'erreur, ou null si le numéro est valide.
  function tableError(value) {
    if (!value) return 'Indiquez votre numéro de table';
    if (/^\d+$/.test(value)) {
      var n = parseInt(value, 10);
      if (n < 1 || n > tableCount()) return 'La table ' + value + ' n’existe pas ici (tables 1 à ' + tableCount() + ')';
    }
    return null;
  }

  function setTable(value) {
    table = String(parseInt(value, 10) || value);
    try {
      var q = new URLSearchParams(location.search);
      q.set('table', table);
      history.replaceState(null, '', '?' + q.toString());
      sessionStorage.setItem('tapigo.v1.table.' + scope, table);
    } catch (e) { /* ignore */ }
    renderHeader();
  }

  function openService() {
    if (!table) return openTablePicker(openService);
    UI.openSheet({
      label: 'Service',
      head: '<p class="eyebrow">Table ' + esc(table) + '</p><h2>Besoin de quelque chose ?</h2>',
      body:
        '<div class="service-grid">' +
          '<button class="service-btn" type="button" data-kind="serveur"><span aria-hidden="true">🙋</span><strong>Appeler un serveur</strong><small>Une question, une demande</small></button>' +
          '<button class="service-btn" type="button" data-kind="addition"><span aria-hidden="true">🧾</span><strong>Demander l’addition</strong><small>Un serveur vient encaisser</small></button>' +
        '</div>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-kind]');
          if (!b || b.disabled) return;
          sheet.querySelectorAll('[data-kind]').forEach(function (x) { x.disabled = true; });
          b.querySelector('small').textContent = 'Envoi…';
          T.requestService(b.dataset.kind, table).then(function () {
            UI.closeSheet();
            UI.vibrate([20, 40, 20]);
            UI.toast(b.dataset.kind === 'addition'
              ? '🧾 <strong>Demande envoyée.</strong> Un serveur arrive avec l’addition.'
              : '🙋 <strong>Demande envoyée.</strong> Un serveur arrive à la table ' + esc(table) + '.', 4000);
          }).catch(function (err) {
            sheet.querySelectorAll('[data-kind]').forEach(function (x) { x.disabled = false; });
            b.querySelector('small').textContent = '';
            UI.toast(esc(err.message), 4000);
          });
        });
      }
    });
  }

  function openTablePicker(onDone) {
    UI.openSheet({
      label: 'Numéro de table',
      head: '<p class="eyebrow">' + esc(state.restaurant.name) + '</p><h2>Quelle est votre table ?</h2>',
      body:
        '<p class="product-desc">Le numéro est indiqué sur votre table.</p>' +
        '<form id="tableForm" novalidate>' +
          '<input class="input table-input" id="tablePick" inputmode="numeric" pattern="[0-9]*" maxlength="4" ' +
            'placeholder="N°" aria-label="Numéro de table" value="' + esc(table || '') + '" autofocus>' +
          '<p class="login__error" id="tableErr" role="alert" hidden></p>' +
        '</form>',
      footer: '<button class="btn btn--primary" type="submit" form="tableForm">' + (table ? 'Valider' : 'Voir la carte et commander') + '</button>',
      onMount: function (sheet) {
        var input = $('#tablePick', sheet);
        input.addEventListener('input', function () {
          input.value = input.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 4);
          $('#tableErr', sheet).hidden = true;
        });
        $('#tableForm', sheet).addEventListener('submit', function (e) {
          e.preventDefault();
          var v = input.value.trim();
          var err = tableError(v);
          if (err) {
            $('#tableErr', sheet).textContent = err;
            $('#tableErr', sheet).hidden = false;
            UI.vibrate(40);
            return input.focus();
          }
          setTable(v);
          UI.closeSheet().then(function () {
            UI.toast('Table <strong>' + esc(table) + '</strong> enregistrée');
            if (onDone) onDone();
          });
        });
      }
    });
  }

  /* ======================================================================
     Filtres & recherche
     ====================================================================== */
  // Commandable : pas en rupture et stock non épuisé.
  function isOrderable(item) { return item && item.available !== false && T.getStock(item.id) !== 0; }

  // Quantité maximale commandable (stock restant moins ce qui est déjà au panier).
  function maxQty(itemId, exceptLine) {
    var st = T.getStock(itemId);
    if (st == null) return 20;
    var inCart = state.cart.reduce(function (sum, l) { return sum + (l.itemId === itemId && l !== exceptLine ? l.qty : 0); }, 0);
    return Math.max(0, Math.min(20, st - inCart));
  }

  function availableItems() {
    return state.menu.items.filter(isOrderable);
  }

  function matches(item) {
    for (var t = 0; t < state.tags.length; t++) {
      if ((item.tags || []).indexOf(state.tags[t]) < 0) return false;
    }
    if (state.q) return norm(item.name + ' ' + item.description).indexOf(norm(state.q)) >= 0;
    return true;
  }

  function renderChips() {
    var items = availableItems();
    var cats = [{ id: 'all', label: 'Tout' }].concat(state.menu.categories);
    $('#catChips').innerHTML = cats.map(function (c) {
      var n = c.id === 'all' ? items.length : items.filter(function (i) { return i.category === c.id; }).length;
      if (c.id !== 'all' && !n) return '';
      return '<button class="chip" type="button" data-cat="' + esc(c.id) + '" aria-pressed="' + (state.cat === c.id) + '">' + esc(c.label) + '</button>';
    }).join('');

    var tags = state.menu.tags || {};
    $('#tagChips').innerHTML = Object.keys(tags).map(function (k) {
      var on = state.tags.indexOf(k) >= 0;
      return '<button class="chip chip--tag" type="button" data-tag="' + esc(k) + '" aria-pressed="' + on + '">' + tagIcon(k) + ' ' + esc(tags[k]) + '</button>';
    }).join('');
  }

  function tagIcon(k) { return { veggie: '🌿', gf: '🌾', signature: '✦' }[k] || '•'; }

  /* ======================================================================
     Menu
     ====================================================================== */
  function qtyInCart(itemId) {
    return state.cart.reduce(function (s, l) { return s + (l.itemId === itemId ? l.qty : 0); }, 0);
  }

  function lowStock(id) { var st = T.getStock(id); return st != null && st > 0 && st <= 5; }

  function dishHTML(item, idx) {
    var tags = state.menu.tags || {};
    var q = qtyInCart(item.id);
    var signature = (item.tags || []).indexOf('signature') >= 0;
    var tagText = (item.tags || []).filter(function (t) { return t !== 'signature'; })
      .map(function (t) { return tagIcon(t) + ' ' + esc(tags[t] || t); }).join(' · ');
    return '<article class="dish" tabindex="0" role="button" data-id="' + esc(item.id) + '" style="animation-delay:' + Math.min(idx * 35, 400) + 'ms" aria-label="' + esc(item.name) + ', ' + fmt(item.price) + '">' +
      '<div class="dish__body">' +
        '<div class="dish__title"><h3>' + esc(item.name) + '</h3>' + (signature ? '<span class="badge badge--gold">Signature</span>' : '') + '</div>' +
        '<p class="dish__desc">' + esc(item.description) + '</p>' +
        '<div class="dish__meta"><span class="price">' + fmt(item.price) + '</span>' +
          (lowStock(item.id) ? '<span class="badge badge--warn">Plus que ' + T.getStock(item.id) + '</span>' : '') +
          (item.options && item.options.length ? '<span class="dish__tags">Personnalisable</span>' : '') +
          (tagText ? '<span class="dish__tags">' + tagText + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="dish__media media" data-emoji="' + esc(item.emoji || '🍽️') + '">' +
        (item.image ? '<img src="' + esc(item.image) + '" alt="" loading="lazy" decoding="async">' : '') +
        (q ? '<span class="dish__qty">' + q + '</span>' : '') +
        '<button class="dish__add" type="button" data-add="' + esc(item.id) + '" aria-label="Ajouter ' + esc(item.name) + '">' + I.plus + '</button>' +
      '</div>' +
    '</article>';
  }

  function renderMenu() {
    var items = availableItems().filter(matches);
    var cats = state.menu.categories.filter(function (c) { return state.cat === 'all' || c.id === state.cat; });
    var idx = 0;
    var html = cats.map(function (c) {
      var list = items.filter(function (i) { return i.category === c.id; });
      if (!list.length) return '';
      return '<section class="c-section" id="cat-' + esc(c.id) + '">' +
        '<div class="c-section__head"><h2>' + esc(c.label) + '</h2><span class="c-section__count">' + list.length + ' choix</span></div>' +
        '<div class="dish-list">' + list.map(function (i) { return dishHTML(i, idx++); }).join('') + '</div>' +
      '</section>';
    }).join('');

    if (!state.menu.items.length) {
      $('#menu').innerHTML = '<div class="empty"><h3>La carte arrive bientôt</h3><p>Le restaurant prépare son menu. Revenez dans quelques instants.</p></div>';
      return;
    }
    $('#menu').innerHTML = html || '<div class="empty"><h3>Aucun résultat</h3><p>Essayez un autre mot-clé ou retirez un filtre.</p>' +
      '<p style="margin-top:16px"><button class="btn btn--ghost btn--sm" type="button" id="resetFilters">Réinitialiser les filtres</button></p></div>';
  }

  /* ======================================================================
     Fiche produit
     ====================================================================== */
  function readSelections(root, item) {
    var sel = {};
    (item.options || []).forEach(function (g) {
      var picked = [].slice.call(root.querySelectorAll('[name="g_' + g.id + '"]:checked')).map(function (i) { return i.value; });
      if (picked.length) sel[g.id] = picked;
    });
    return sel;
  }

  function allergensHTML(item) {
    var list = T.itemAllergens(item);
    if (list.length) {
      return '<div class="allergens"><span>Allergènes</span><div class="check-row">' + list.map(function (a) {
        return '<span class="badge badge--warn">' + esc(a.label) + '</span>';
      }).join('') + '</div></div>';
    }
    return item.allergens ? '<p class="allergens">Allergènes : ' + esc(item.allergens) + '</p>' : '';
  }

  function pairingsHTML(item) {
    var list = (item.pairings || []).map(T.getItem).filter(isOrderable);
    if (!list.length) return '';
    return '<div class="pairings"><p class="eyebrow">Parfait avec</p>' + list.map(function (p) {
      return '<button class="pair" type="button" data-pair="' + esc(p.id) + '">' + UI.media(p, 'pair__media') +
        '<span class="pair__name">' + esc(p.name) + '<small>' + fmt(p.price) + '</small></span><span class="pair__add" aria-hidden="true">+</span></button>';
    }).join('') + '</div>';
  }

  function openProduct(id) {
    var item = T.getItem(id);
    if (!isOrderable(item)) return UI.toast('Ce plat n’est plus disponible');
    var qty = 1;
    var tags = state.menu.tags || {};

    var groups = (item.options || []).map(function (g) {
      var multi = g.type === 'multi';
      return '<fieldset class="opt-group' + (g.required ? ' is-required' : '') + '" data-group="' + esc(g.id) + '" data-type="' + (multi ? 'multi' : 'single') + '" data-required="' + !!g.required + '">' +
        '<legend>' + esc(g.name) + '<small>' + (g.required ? 'Obligatoire' : multi ? 'Facultatif · plusieurs choix' : 'Facultatif') + '</small></legend>' +
        g.choices.map(function (c) {
          return '<label class="opt"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="g_' + esc(g.id) + '" value="' + esc(c.label) + '">' +
            '<span class="opt__mark' + (multi ? ' opt__mark--check' : '') + '"></span>' +
            '<span class="opt__label">' + esc(c.label) + '</span>' +
            (Number(c.price) ? '<span class="opt__price">+ ' + fmt(c.price) + '</span>' : '') +
          '</label>';
        }).join('') +
      '</fieldset>';
    }).join('');

    UI.openSheet({
      label: item.name,
      media: UI.media(item, 'sheet__media'),
      head:
        '<div class="check-row" style="margin-bottom:10px">' + (item.tags || []).map(function (t) {
          return '<span class="badge' + (t === 'signature' ? ' badge--gold' : '') + '">' + tagIcon(t) + ' ' + esc(tags[t] || t) + '</span>';
        }).join('') + '</div>' +
        '<h2>' + esc(item.name) + '</h2>',
      body:
        '<p class="product-desc">' + esc(item.description) + '</p>' +
        (lowStock(item.id) ? '<p><span class="badge badge--warn">Plus que ' + T.getStock(item.id) + ' disponible' + (T.getStock(item.id) > 1 ? 's' : '') + '</span></p>' : '') +
        allergensHTML(item) +
        pairingsHTML(item) +
        groups +
        '<label class="field"><span>Note pour la cuisine</span>' +
          '<textarea id="pNote" maxlength="140" placeholder="Ex : sans oignon, sauce à part, allergie…"></textarea></label>',
      footer:
        '<div class="stepper" role="group" aria-label="Quantité">' +
          '<button type="button" data-step="-1" aria-label="Retirer un">−</button><output id="pQty">1</output><button type="button" data-step="1" aria-label="Ajouter un">+</button>' +
        '</div>' +
        '<button class="btn btn--primary" type="button" id="pAdd"></button>',
      onMount: function (sheet) {
        var btn = $('#pAdd', sheet);
        var update = function () {
          var line = T.buildLine(item.id, qty, readSelections(sheet, item), '');
          $('#pQty', sheet).textContent = qty;
          btn.textContent = 'Ajouter · ' + fmt(line.unitPrice * qty);
        };
        update();

        // Un choix unique facultatif peut être désélectionné d'un second tap.
        var wasChecked = null;
        sheet.addEventListener('pointerdown', function (e) {
          var lab = e.target.closest('.opt-group[data-type="single"][data-required="false"] .opt');
          wasChecked = lab ? lab.querySelector('input').checked : null;
        });
        sheet.addEventListener('click', function (e) {
          var pair = e.target.closest('[data-pair]');
          if (pair) {
            var p = T.getItem(pair.dataset.pair);
            if (p && !(p.options || []).some(function (g) { return g.required; })) {
              if (addToCart(p.id, 1, {}, '')) {
                pair.disabled = true;
                pair.querySelector('.pair__add').textContent = '✓';
                UI.toast('<strong>' + esc(p.name) + '</strong> ajouté au panier', 1800);
              }
            } else if (p) {
              UI.closeSheet().then(function () { openProduct(p.id); });
            }
            return;
          }
          var input = e.target.closest('.opt-group[data-type="single"][data-required="false"] input');
          if (input && wasChecked) { input.checked = false; wasChecked = null; update(); }
          var step = e.target.closest('[data-step]');
          if (step) {
            var max = Math.max(1, maxQty(item.id));
            if (Number(step.dataset.step) > 0 && qty >= max && T.getStock(item.id) != null) UI.toast('Plus que ' + max + ' disponible' + (max > 1 ? 's' : ''));
            qty = Math.min(max, Math.max(1, qty + Number(step.dataset.step)));
            update();
          }
        });
        sheet.addEventListener('change', function (e) {
          var g = e.target.closest('.opt-group');
          if (g) g.classList.remove('is-invalid');
          update();
        });

        btn.addEventListener('click', function () {
          var sel = readSelections(sheet, item);
          var missing = (item.options || []).filter(function (g) { return g.required && !sel[g.id]; });
          if (missing.length) {
            var el = sheet.querySelector('[data-group="' + missing[0].id + '"]');
            missing.forEach(function (g) {
              var f = sheet.querySelector('[data-group="' + g.id + '"]');
              f.classList.remove('is-invalid'); void f.offsetWidth; f.classList.add('is-invalid');
            });
            // Défile dans la zone scrollable du sheet (scrollIntoView décalerait le sheet entier).
            var scroller = sheet.querySelector('.sheet__scroll');
            scroller.scrollTo({
              top: scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24,
              behavior: 'smooth'
            });
            UI.vibrate(40);
            return;
          }
          var added = addToCart(item.id, qty, sel, $('#pNote', sheet).value.trim());
          if (!added) return;
          UI.closeSheet();
          UI.toast('<strong>' + added + ' × ' + esc(item.name) + '</strong> ajouté au panier');
        });
      }
    });
  }

  /* ======================================================================
     Panier
     ====================================================================== */
  function lineKey(itemId, sel, note) {
    var s = Object.keys(sel).sort().map(function (k) { return k + ':' + sel[k].slice().sort().join(','); }).join('|');
    return itemId + '#' + s + '#' + note;
  }

  function saveCart() {
    T.write(CART_KEY, state.cart);
    T.write(NOTE_KEY, state.note);
  }

  function addToCart(itemId, qty, sel, note) {
    var key = lineKey(itemId, sel, note);
    var existing = state.cart.filter(function (l) { return l.key === key; })[0];
    var room = maxQty(itemId);
    if (room <= 0) { UI.toast('Plus aucun disponible pour le moment'); return false; }
    qty = Math.min(qty, room);
    if (existing) existing.qty = Math.min(50, existing.qty + qty);
    else state.cart.push({ key: key, itemId: itemId, qty: qty, selections: sel, note: note });
    saveCart();
    renderCartBar(true);
    renderMenu();
    UI.vibrate(15);
    return qty; // quantité réellement ajoutée (plafonnée au stock)
  }

  /* Prix toujours recalculés depuis le menu courant (le restaurateur peut changer un prix). */
  function cartLines() {
    return state.cart.map(function (l) {
      var item = T.getItem(l.itemId);
      var built = item ? T.buildLine(l.itemId, l.qty, l.selections, l.note) : null;
      return { raw: l, item: item, built: built, unavailable: !isOrderable(item) };
    });
  }

  function cartSummary() {
    var lines = cartLines().filter(function (l) { return !l.unavailable; });
    return {
      count: lines.reduce(function (s, l) { return s + l.raw.qty; }, 0),
      total: lines.reduce(function (s, l) { return s + l.built.unitPrice * l.raw.qty; }, 0),
      lines: lines
    };
  }

  function renderCartBar(bump) {
    var s = cartSummary();
    var bar = $('#cartBar');
    bar.hidden = !state.cart.length || !!state.trackingId;
    $('#cartCount').textContent = s.count;
    $('#cartTotal').textContent = fmt(s.total);
    if (bump) { bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump'); }
  }

  function optText(built) {
    return built.options.map(function (o) { return o.values.join(', '); }).join(' · ');
  }

  function cartBodyHTML() {
    var lines = cartLines();
    if (!lines.length) {
      return '<div class="empty"><h3>Votre panier est vide</h3><p>Parcourez la carte et laissez-vous tenter.</p></div>';
    }
    var s = cartSummary();
    return '<div>' + lines.map(function (l, i) {
      var r = l.raw;
      if (l.unavailable) {
        return '<div class="cart-line"><div><h4>' + esc(l.item ? l.item.name : 'Produit retiré') + '</h4>' +
          '<p class="cart-line__opts"><span class="badge badge--danger">Plus disponible</span></p></div>' +
          '<div class="cart-line__actions"><button class="link-btn link-btn--danger" type="button" data-remove="' + i + '">Retirer</button></div></div>';
      }
      return '<div class="cart-line">' +
        '<div><h4>' + esc(l.item.name) + '</h4>' +
          (l.built.options.length ? '<p class="cart-line__opts">' + esc(optText(l.built)) + '</p>' : '') +
          (r.note ? '<p class="cart-line__note">« ' + esc(r.note) + ' »</p>' : '') +
        '</div>' +
        '<div class="cart-line__price">' + fmt(l.built.unitPrice * r.qty) + '</div>' +
        '<div class="cart-line__actions">' +
          '<div class="stepper stepper--sm" role="group" aria-label="Quantité">' +
            '<button type="button" data-qty="' + i + '" data-d="-1" aria-label="Retirer un">−</button><output>' + r.qty + '</output>' +
            '<button type="button" data-qty="' + i + '" data-d="1" aria-label="Ajouter un">+</button></div>' +
          '<button class="link-btn" type="button" data-note="' + i + '">' + (r.note ? 'Modifier la note' : 'Ajouter une note') + '</button>' +
          '<button class="link-btn link-btn--danger" type="button" data-remove="' + i + '" style="margin-left:auto">Retirer</button>' +
        '</div>' +
        '<div class="line-note-input" data-note-box="' + i + '" hidden><input class="input" maxlength="140" placeholder="Ex : sans oignon" value="' + esc(r.note) + '"></div>' +
      '</div>';
    }).join('') + '</div>' +
    '<label class="field"><span>Un message pour toute la commande ?</span>' +
      '<textarea id="cartNote" maxlength="200" placeholder="Ex : servir les entrées ensemble, une chaise bébé…">' + esc(state.note) + '</textarea></label>' +
    '<div class="totals">' +
      '<div class="totals__row"><span>' + s.count + ' article' + (s.count > 1 ? 's' : '') + '</span><span>' + fmt(s.total) + '</span></div>' +
      '<div class="totals__row"><span>Service</span><span>Inclus</span></div>' +
      '<div class="totals__row totals__row--grand"><span>Total TTC</span><span>' + fmt(s.total) + '</span></div>' +
    '</div>';
  }

  function openCart() {
    UI.openSheet({
      label: 'Panier',
      head: '<p class="eyebrow">' + (table ? 'Table ' + esc(table) : 'Votre commande') + '</p><h2>Votre panier</h2>',
      body: '<div id="cartBody"></div>',
      footer: '<button class="btn btn--primary" type="button" id="toCheckout"></button>',
      onMount: function (sheet) {
        var body = $('#cartBody', sheet);
        var btn = $('#toCheckout', sheet);
        var paint = function () {
          body.innerHTML = cartBodyHTML();
          var s = cartSummary();
          var paused = !!state.restaurant.ordersPaused;
          btn.disabled = !s.count || paused;
          btn.textContent = paused ? 'Commandes en pause' : s.count ? 'Commander · ' + fmt(s.total) : 'Panier vide';
          renderCartBar();
        };
        paint();
        body.addEventListener('click', function (e) {
          var t = e.target.closest('button');
          if (!t) return;
          if (t.dataset.qty != null) {
            var l = state.cart[+t.dataset.qty];
            if (Number(t.dataset.d) > 0 && maxQty(l.itemId, l) <= l.qty) {
              UI.toast('Plus que ' + T.getStock(l.itemId) + ' disponible' + (T.getStock(l.itemId) > 1 ? 's' : ''));
              return;
            }
            l.qty += Number(t.dataset.d);
            if (l.qty <= 0) state.cart.splice(+t.dataset.qty, 1);
            saveCart(); paint(); renderMenu();
          } else if (t.dataset.remove != null) {
            state.cart.splice(+t.dataset.remove, 1);
            saveCart(); paint(); renderMenu();
          } else if (t.dataset.note != null) {
            var box = body.querySelector('[data-note-box="' + t.dataset.note + '"]');
            box.hidden = !box.hidden;
            if (!box.hidden) box.querySelector('input').focus();
          }
        });
        body.addEventListener('change', function (e) {
          if (e.target.id === 'cartNote') { state.note = e.target.value.trim(); saveCart(); return; }
          var box = e.target.closest('[data-note-box]');
          if (box) {
            var line = state.cart[+box.dataset.noteBox];
            line.note = e.target.value.trim();
            // Fusionne avec une ligne identique éventuelle.
            line.key = lineKey(line.itemId, line.selections, line.note);
            var dup = state.cart.filter(function (x) { return x !== line && x.key === line.key; })[0];
            if (dup) { dup.qty += line.qty; state.cart.splice(state.cart.indexOf(line), 1); }
            saveCart(); paint();
          }
        });
        btn.addEventListener('click', function () {
          var note = $('#cartNote', sheet);
          if (note) { state.note = note.value.trim(); saveCart(); }
          openCheckout();
        });
      }
    });
  }

  /* ======================================================================
     Paiement
     ====================================================================== */
  function payMethodHTML(id, icon, title, sub) {
    return '<label class="pay-method"><input type="radio" name="pay" value="' + id + '"' + (state.payMethod === id ? ' checked' : '') + '>' +
      '<span class="pay-method__icon' + (id === 'applepay' ? ' pay-method__icon--apple' : '') + '">' + icon + '</span>' +
      '<span class="pay-method__text"><strong>' + title + '</strong><span>' + sub + '</span></span>' +
      '<span class="opt__mark"></span></label>';
  }

  /* Pourboire (paiement en ligne uniquement : à table, il se laisse sur le terminal). */
  function tipsOffered() { return state.restaurant.tipsEnabled !== false; }

  function tipAmount(total) {
    var t = state.tip;
    if (t.mode === 'pct') return Math.round(total * t.pct) / 100;
    if (t.mode === 'custom') return Math.min(t.amount, total);
    return 0;
  }

  function tipHTML(total) {
    var t = state.tip;
    var chip = function (val, label, sub, on) {
      return '<button type="button" class="tip-chip' + (on ? ' is-on' : '') + '" data-tip="' + val + '" aria-pressed="' + on + '">' +
        '<b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
    };
    var server = table && T.getTableServer ? T.getTableServer(table) : '';
    return '<div class="tip-box"><p class="tip-box__title">Un pourboire pour ' + (server ? esc(server) + ' et l’équipe' : 'l’équipe') + ' ?</p>' +
      '<div class="tip-chips">' +
        chip('0', 'Non merci', '', t.mode === 'none') +
        [5, 10, 15].map(function (p) { return chip(p, p + ' %', fmt(Math.round(total * p) / 100), t.mode === 'pct' && t.pct === p); }).join('') +
        chip('custom', 'Autre', 'montant', t.mode === 'custom') +
      '</div>' +
      (t.mode === 'custom'
        ? '<label class="tip-custom"><span>Montant du pourboire</span><input id="tipCustom" inputmode="decimal" placeholder="0,00" value="' +
          (t.amount ? String(t.amount).replace('.', ',') : '') + '"><b>€</b></label>'
        : '') +
      '<p class="help">Reversé intégralement au restaurant.</p></div>';
  }

  function openCheckout() {
    var s = cartSummary();
    if (!s.count) return;
    var walletLabel = /android/i.test(navigator.userAgent) ? 'Google Pay' : 'Apple Pay';
    // En ligne : « Payer maintenant » si le restaurant a activé le paiement Stripe.
    var online = LIVE && T.canPayOnline();
    if (LIVE && !online) state.payMethod = 'onsite';

    UI.openSheet({
      label: 'Paiement',
      head: '<p class="eyebrow">Étape finale</p><h2>' + (LIVE && !online ? 'Valider la commande' : 'Payer &amp; commander') + '</h2>',
      body:
        (table
          ? '<div class="totals"><div class="totals__row"><span>Table</span><strong style="color:var(--ink)">' + esc(table) + '</strong></div>' +
            '<div class="totals__row"><span>' + s.count + ' article' + (s.count > 1 ? 's' : '') + '</span><strong style="color:var(--ink)">' + fmt(s.total) + '</strong></div></div>'
          : '<label class="field"><span>Numéro de votre table</span><input id="tableInput" inputmode="numeric" maxlength="4" placeholder="Ex : 12" autofocus>' +
            '<small class="help">Indiqué sur le chevalet NFC posé sur votre table.</small></label>') +
        '<div class="pay-methods" role="radiogroup" aria-label="Moyen de paiement">' +
          (LIVE ? (online ? payMethodHTML('online', I.card, 'Payer maintenant', 'Carte, ' + walletLabel + ' · paiement sécurisé') : '') :
            payMethodHTML('applepay', I.apple, walletLabel, 'Paiement express en un geste') +
            payMethodHTML('card', I.card, 'Carte bancaire', 'Visa, Mastercard, Amex · via Stripe')) +
          payMethodHTML('onsite', I.wallet, LIVE ? 'Payer à table' : 'Payer sur place', 'Le serveur passe avec le terminal en fin de repas') +
        '</div>' +
        '<div id="tipBox"></div>' +
        '<div id="cardForm"></div>' +
        '<p class="secure" id="payNote"></p>',
      footer: '<button class="btn btn--primary" type="button" id="payBtn"></button>',
      onMount: function (sheet) {
        var btn = $('#payBtn', sheet);
        var paint = function () {
          var m = state.payMethod;
          $('#cardForm', sheet).innerHTML = m === 'card'
            ? '<div class="card-form">' +
                '<label class="field"><span>Numéro de carte</span><input id="ccNum" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="19"></label>' +
                '<label class="field"><span>Expiration</span><input id="ccExp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5"></label>' +
                '<label class="field"><span>CVC</span><input id="ccCvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"></label>' +
                '<p class="help">Mode démo : utilisez 4242 4242 4242 4242, n’importe quelle date future et un CVC.</p>' +
              '</div>'
            : '';
          $('#payNote', sheet).innerHTML = m === 'onsite'
            ? (LIVE ? 'Vous réglerez directement à table, en fin de repas.' : I.lock + ' Paiement sécurisé par Stripe · Données chiffrées')
            : m === 'online'
              ? I.lock + ' Paiement sécurisé par Stripe, encaissé directement par ' + esc(state.restaurant.name) + '. Votre commande part en cuisine dès le paiement validé.'
              : I.lock + ' Paiement sécurisé par Stripe · Données chiffrées';
          paintTip(true);
        };
        // Pourboire + bouton seulement (sans effacer la carte en cours de saisie).
        var paintTip = function (rebuild) {
          var m = state.payMethod;
          var tipOn = tipsOffered() && m !== 'onsite';
          if (rebuild) $('#tipBox', sheet).innerHTML = tipOn ? tipHTML(s.total) : '';
          var due = s.total + (tipOn ? tipAmount(s.total) : 0);
          btn.innerHTML = m === 'onsite'
            ? 'Commander · ' + fmt(s.total)
            : m === 'online' ? I.lock.replace('<svg ', '<svg width="16" height="16" ') + ' Payer · ' + fmt(due)
            : m === 'applepay' ? I.apple.replace('<svg ', '<svg width="18" height="18" ') + ' Payer et commander · ' + fmt(due)
            : 'Payer et commander · ' + fmt(due);
        };
        paint();

        sheet.addEventListener('change', function (e) {
          if (e.target.name === 'pay') { state.payMethod = e.target.value; paint(); }
        });
        sheet.addEventListener('click', function (e) {
          var c = e.target.closest('[data-tip]');
          if (!c) return;
          var v = c.dataset.tip;
          state.tip = v === 'custom' ? { mode: 'custom', pct: 0, amount: state.tip.mode === 'custom' ? state.tip.amount : 0 }
            : v === '0' ? { mode: 'none', pct: 0, amount: 0 }
            : { mode: 'pct', pct: +v, amount: 0 };
          paintTip(true);
          if (v === 'custom') { var f = $('#tipCustom', sheet); f.focus(); }
        });
        sheet.addEventListener('input', function (e) {
          var t = e.target;
          if (t.id === 'ccNum') t.value = t.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
          if (t.id === 'ccExp') t.value = t.value.replace(/\D/g, '').slice(0, 4).replace(/^(\d{2})(\d)/, '$1/$2');
          if (t.id === 'ccCvc') t.value = t.value.replace(/\D/g, '').slice(0, 4);
          if (t.id === 'tableInput') t.value = t.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 4);
          if (t.id === 'tipCustom') {
            t.value = t.value.replace(/[^0-9.,]/g, '').slice(0, 7);
            var amt = Math.round((parseFloat(t.value.replace(',', '.')) || 0) * 100) / 100;
            state.tip.amount = Math.min(Math.max(0, amt), s.total);
            paintTip(false);
          }
          t.style.borderColor = '';
        });

        btn.addEventListener('click', function () {
          var tableNo = table || ($('#tableInput', sheet) && $('#tableInput', sheet).value.trim());
          var tErr = tableError(tableNo);
          if (tErr) return invalid($('#tableInput', sheet), tErr);
          if (state.restaurant.ordersPaused) return UI.toast('Les commandes en ligne sont en pause. Adressez-vous au serveur.', 4000);
          if (state.payMethod === 'card') {
            var num = $('#ccNum', sheet), exp = $('#ccExp', sheet), cvc = $('#ccCvc', sheet);
            if (!luhn(num.value.replace(/\s/g, ''))) return invalid(num, 'Numéro de carte invalide');
            if (!validExpiry(exp.value)) return invalid(exp, 'Date d’expiration invalide');
            if (cvc.value.length < 3) return invalid(cvc, 'CVC invalide');
          }
          submit(btn, tableNo);
        });
      }
    });
  }

  function invalid(input, msg) {
    if (input) { input.style.borderColor = 'var(--danger)'; input.focus(); }
    UI.toast(msg);
    UI.vibrate(40);
  }

  function luhn(n) {
    if (!/^\d{13,19}$/.test(n)) return false;
    var sum = 0, alt = false;
    for (var i = n.length - 1; i >= 0; i--) {
      var d = +n[i];
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }

  function validExpiry(v) {
    var m = /^(\d{2})\/(\d{2})$/.exec(v);
    if (!m || +m[1] < 1 || +m[1] > 12) return false;
    return new Date(2000 + +m[2], +m[1], 0, 23, 59) >= new Date();
  }

  // Mode démo uniquement : paiement simulé. En ligne, voir payOnline() plus bas
  // (Stripe Checkout via la fonction serveur stripe-checkout).
  function simulatePayment(method) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({
          method: method,
          status: method === 'onsite' ? 'pending' : 'paid',
          ref: method === 'onsite' ? null : 'pi_demo_' + Math.random().toString(36).slice(2, 10)
        });
      }, method === 'onsite' ? 600 : 1500);
    });
  }

  function submit(btn, tableNo) {
    var s = cartSummary();

    var label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + (state.payMethod === 'onsite' ? 'Envoi en cuisine…'
      : state.payMethod === 'online' ? 'Ouverture du paiement…' : 'Paiement sécurisé en cours…');

    if (LIVE && state.payMethod === 'online') return payOnline(btn, label, tableNo, s);

    // En ligne : le paiement se fait à table, la commande part directement.
    var pay = LIVE ? Promise.resolve({ method: 'onsite', status: 'pending' }) : simulatePayment(state.payMethod);
    pay.then(function (payment) {
      return T.createOrder({
        table: tableNo,
        note: state.note,
        payment: payment,
        tip: payment.method !== 'onsite' && tipsOffered() ? tipAmount(s.total) : 0,
        lines: s.lines.map(function (l) { return l.built; })
      });
    }).then(function (order) {
      state.cart = []; state.note = ''; state.tip = { mode: 'none', pct: 0, amount: 0 };
      saveCart();
      if (!table) setTable(tableNo);
      state.mine.push(order.id);
      T.write(MINE_KEY, state.mine);
      T.track(order.id);
      UI.vibrate([20, 40, 20]);
      UI.closeSheet().then(function () { showTracking(order.id); });
      renderMenu();
      renderCartBar();
    }).catch(function (err) {
      btn.disabled = false;
      btn.innerHTML = label;
      UI.toast(esc((err && err.message) || 'La commande n’a pas pu être envoyée. Réessayez.'), 4500);
      UI.vibrate(60);
      // La carte a peut-être changé (rupture) : on la recharge.
      state.menu = T.getMenu(); renderMenu(); renderCartBar();
    });
  }

  /*
   * Paiement en ligne : la commande est enregistrée (prix recalculés en base,
   * stock réservé) mais reste invisible en cuisine ; le client part sur la page
   * de paiement Stripe puis revient sur menu.html?paid=<id> (ou ?cancel=<id>).
   * Le panier n'est vidé qu'au retour, une fois le paiement accepté.
   */
  function payOnline(btn, label, tableNo, s) {
    var orderId = null;
    T.createOrder({
      table: tableNo,
      note: state.note,
      pay: 'online',
      tip: tipsOffered() ? tipAmount(s.total) : 0,
      lines: s.lines.map(function (l) { return l.built; })
    }).then(function (order) {
      orderId = order.id;
      setTable(tableNo); // mémorisée pour le retour de la page de paiement
      return T.payments.checkout(order.id);
    }).then(function (res) {
      if (res && res.paid) return paymentReturn(orderId, true);
      if (!res || !res.url) throw new Error('Le paiement n’a pas pu s’ouvrir. Réessayez ou choisissez « Payer à table ».');
      location.href = res.url;
    }).catch(function (err) {
      if (orderId) T.payments.cancel(orderId).catch(function () {});
      btn.disabled = false;
      btn.innerHTML = label;
      UI.toast(esc((err && err.message) || 'Le paiement n’a pas pu s’ouvrir. Réessayez.'), 5000);
      UI.vibrate(60);
      state.menu = T.getMenu(); renderMenu(); renderCartBar();
    });
  }

  // Retour de la page Stripe.
  function paymentReturn(id, paid) {
    try {
      var q = new URLSearchParams(location.search);
      q.delete('paid'); q.delete('cancel');
      history.replaceState(null, '', '?' + q.toString());
    } catch (e) { /* ignore */ }
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return;
    if (!paid) {
      T.payments.cancel(id).catch(function () {});
      UI.toast('Paiement annulé · votre panier est conservé', 4500);
      return;
    }
    state.cart = []; state.note = ''; state.tip = { mode: 'none', pct: 0, amount: 0 };
    saveCart();
    if (state.mine.indexOf(id) < 0) { state.mine.push(id); T.write(MINE_KEY, state.mine); }
    UI.closeSheet();
    renderMenu(); renderCartBar();
    T.track(id).then(function () {
      if (T.getOrder(id)) { UI.vibrate([20, 40, 20]); showTracking(id); }
      confirmPayment(id, 0);
    });
  }

  // Filet de sécurité : si la confirmation de Stripe tarde, on interroge
  // Stripe directement (immédiatement, puis après 4 s et 12 s).
  function confirmPayment(id, attempt) {
    var o = T.getOrder(id);
    if (!o || o.payment.status !== 'awaiting' || !T.payments || !T.payments.sync) return;
    T.payments.sync(id).catch(function () { return null; }).then(function (r) {
      return T.track(id).then(function () {
        if (r && r.cancelled) UI.toast('Paiement non abouti : la commande a été annulée. Votre carte n’a pas été débitée.', 6000);
        if (!(r && (r.paid || r.cancelled)) && attempt < 2) setTimeout(function () { confirmPayment(id, attempt + 1); }, attempt ? 8000 : 4000);
      });
    });
  }

  /* ======================================================================
     Suivi de commande en temps réel
     ====================================================================== */
  var CLIENT_STEPS = [
    { id: 'nouvelle', label: 'Commande envoyée en cuisine' },
    { id: 'preparation', label: 'En préparation' },
    { id: 'prete', label: 'Prête' },
    { id: 'servie', label: 'Servie' }
  ];
  var PAY_LABEL = { applepay: 'Apple Pay', card: 'Carte bancaire', onsite: 'Sur place', online: 'en ligne' };

  function stepTime(order, id) {
    var h = (order.history || []).filter(function (x) { return x.status === id; })[0];
    return h ? T.clock(h.at) : '';
  }

  function trackHTML(order) {
    var pending = order.payment.status === 'awaiting';
    var idx = pending ? -1 : order.status === 'terminee' ? CLIENT_STEPS.length : CLIENT_STEPS.map(function (s) { return s.id; }).indexOf(order.status);
    var info = pending
      ? { client: 'Paiement en cours de validation', hint: 'Votre commande part en cuisine dès que le paiement est confirmé (quelques secondes).', pending: true }
      : T.statusInfo(order.status);
    var icon = order.status === 'preparation' ? '<div class="track__icon is-cooking">' + I.chef + '</div>'
      : order.status === 'prete' ? '<div class="track__icon is-cooking">' + I.tray + '</div>'
      : pending ? '<div class="track__icon is-cooking">' + I.lock + '</div>'
      : '<div class="track__icon">' + I.check + '</div>';
    var paid = order.payment.status === 'paid';

    return '<div class="track__inner">' +
      '<div class="track__top">' +
        '<button class="icon-btn" type="button" data-close-track aria-label="Retour au menu">' + I.back + '</button>' +
        '<span class="badge badge--dark">Table ' + esc(order.table) + '</span>' +
      '</div>' +
      '<div class="track__hero">' + icon +
        '<p class="eyebrow">Commande n° ' + order.number + ' · ' + T.clock(order.createdAt) + '</p>' +
        '<h2>' + esc(info.client) + '</h2><p>' + esc(info.hint) + '</p>' +
        (info.pending ? '<p><button class="btn btn--ghost btn--sm" type="button" data-check-pay="' + esc(order.id) + '">Vérifier le paiement</button></p>' : '') +
        (T.getTableServer && T.getTableServer(order.table) ? '<p class="track__server">Votre serveur : <strong>' + esc(T.getTableServer(order.table)) + '</strong></p>' : '') +
      '</div>' +
      '<ol class="steps">' + CLIENT_STEPS.map(function (s, i) {
        // Étapes atteintes cochées, l'étape suivante « respire ».
        var cls = i <= idx ? 'is-done' : i === idx + 1 ? 'is-current' : '';
        return '<li class="step ' + cls + '"><span class="step__dot">' + I.check + '</span>' +
          '<span class="step__label">' + s.label + '</span><span class="step__time">' + stepTime(order, s.id) + '</span></li>';
      }).join('') + '</ol>' +
      '<div class="recap">' + order.lines.map(function (l) {
        return '<div class="cart-line"><span class="qty">' + l.qty + '×</span><div><h4>' + esc(l.name) + '</h4>' +
          (l.options.length ? '<p class="cart-line__opts">' + esc(optText(l)) + '</p>' : '') +
          (l.note ? '<p class="cart-line__note">« ' + esc(l.note) + ' »</p>' : '') +
          '</div><div class="cart-line__price">' + fmt(l.unitPrice * l.qty) + '</div></div>';
      }).join('') +
        (order.note ? '<div class="cart-line"><span></span><p class="cart-line__note">Note : « ' + esc(order.note) + ' »</p><span></span></div>' : '') +
      '</div>' +
      '<div class="totals">' +
        '<div class="totals__row"><span>Paiement</span><span class="badge ' + (paid ? 'badge--ok' : 'badge--warn') + '">' +
          (paid ? 'Payé · ' + (PAY_LABEL[order.payment.method] || 'carte') : pending ? 'Paiement en cours…' : 'À régler sur place') + '</span></div>' +
        (order.tip ? '<div class="totals__row"><span>Pourboire</span><span>' + fmt(order.tip) + '</span></div>' : '') +
        '<div class="totals__row totals__row--grand"><span>Total</span><span>' + fmt(order.total + (order.tip || 0)) + '</span></div>' +
      '</div>' +
      ((order.status === 'servie' || order.status === 'terminee') && state.restaurant.reviewUrl
        ? '<div class="review-cta"><p><strong>Vous avez aimé ?</strong> Votre avis aide beaucoup ' + esc(state.restaurant.name) + '.</p>' +
          '<a class="btn btn--ghost btn--block" href="' + esc(safeUrl(state.restaurant.reviewUrl)) + '" target="_blank" rel="noopener">★ Laisser un avis Google</a></div>'
        : '') +
      '<button class="btn btn--primary btn--block" type="button" data-close-track>Revenir au menu</button>' +
      '<p class="secure">Cette page se met à jour automatiquement.</p>' +
    '</div>';
  }

  /*
   * Commande terminée : remerciement puis redirection vers la page d'avis
   * Google après quelques secondes (annulable). Une seule fois par visite.
   */
  var REVIEW_DELAY = 6;
  var REVIEW_KEY = 'tapigo.v1.reviewed.' + scope;
  var reviewAsked = false;
  function askReview(order) {
    var url = safeUrl(state.restaurant.reviewUrl);
    if (url === '#') return;
    // Une seule fois par commande (même si la page est rouverte), et une
    // seule fenêtre par visite.
    if (reviewAsked) return;
    var done = T.read(REVIEW_KEY, []);
    if (done.indexOf(order.id) >= 0) return;
    reviewAsked = true;
    T.write(REVIEW_KEY, done.concat(order.id).slice(-30));
    var left = REVIEW_DELAY, timer = null;
    UI.closeSheet().then(function () {
      UI.openSheet({
        label: 'Laisser un avis',
        head: '<p class="eyebrow">Merci pour votre visite</p><h2>Vous avez aimé ?</h2>',
        body: '<p class="review-ask">Votre avis aide beaucoup <strong>' + esc(state.restaurant.name) + '</strong>' +
          (T.getTableServer && T.getTableServer(order.table) ? ' et ' + esc(T.getTableServer(order.table)) : '') + '. Cela ne prend que 30 secondes.</p>' +
          '<p class="help" id="reviewCount">Ouverture de Google dans ' + left + ' s…</p>',
        footer: '<a class="btn btn--primary" href="' + esc(url) + '" id="reviewGo">★ Donner mon avis</a>' +
          '<button class="btn btn--ghost" type="button" id="reviewNo">Non merci</button>',
        onMount: function (sheet) {
          var stop = function () { clearInterval(timer); };
          $('#reviewNo', sheet).addEventListener('click', function () { stop(); UI.closeSheet(); });
          $('#reviewGo', sheet).addEventListener('click', stop);
          timer = setInterval(function () {
            // Fenêtre fermée (glissée ou ✕) : pas de redirection.
            if (!document.body.contains(sheet) || sheet.classList.contains('is-closing')) return stop();
            left -= 1;
            var c = $('#reviewCount', sheet);
            if (c) c.textContent = left > 0 ? 'Ouverture de Google dans ' + left + ' s…' : 'Ouverture de Google…';
            if (left <= 0) { stop(); location.href = url; }
          }, 1000);
        }
      });
    });
  }

  function safeUrl(u) { return /^https:\/\//i.test(u || '') ? u : '#'; }

  function showTracking(id) {
    var order = T.getOrder(id);
    if (!order) return;
    state.trackingId = id;
    var root = $('#trackRoot');
    root.innerHTML = '<section class="track" role="dialog" aria-modal="true" aria-label="Suivi de commande">' + trackHTML(order) + '</section>';
    document.body.style.overflow = 'hidden';
    renderCartBar();
    renderTrackPill();
  }

  function hideTracking() {
    state.trackingId = null;
    $('#trackRoot').innerHTML = '';
    document.body.style.overflow = '';
    renderCartBar();
    renderTrackPill();
  }

  function activeOrders() {
    return state.mine.map(T.getOrder).filter(function (o) { return o && o.status !== 'terminee'; });
  }

  function renderTrackPill() {
    var list = activeOrders();
    var pill = $('#trackPill');
    pill.hidden = !list.length || !!state.trackingId;
    if (!list.length) return;
    $('#trackPillLabel').textContent = list.length > 1
      ? list.length + ' commandes en cours'
      : 'N° ' + list[0].number + ' · ' + T.statusInfo(list[0].status).label;
  }

  function openOrdersList() {
    var list = activeOrders();
    if (list.length === 1) return showTracking(list[0].id);
    UI.openSheet({
      label: 'Mes commandes',
      head: '<p class="eyebrow">Table ' + esc(table) + '</p><h2>Mes commandes</h2>',
      body: '<div class="order-list">' + list.slice().reverse().map(function (o) {
        return '<button class="order-link" type="button" data-track="' + esc(o.id) + '"><span><strong>Commande n° ' + o.number + '</strong><br>' +
          '<small style="color:var(--muted)">' + T.clock(o.createdAt) + ' · ' + fmt(o.total) + '</small></span>' +
          '<span class="badge badge--dark">' + esc(T.statusInfo(o.status).label) + '</span></button>';
      }).join('') + '</div>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-track]');
          if (b) UI.closeSheet().then(function () { showTracking(b.dataset.track); });
        });
      }
    });
  }

  /* ======================================================================
     Événements
     ====================================================================== */
  function bind() {
    $('#searchIcon').outerHTML = I.search;

    var search = $('#search'), clear = $('#searchClear'), timer;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      clear.hidden = !search.value;
      timer = setTimeout(function () { state.q = search.value.trim(); renderMenu(); }, 120);
    });
    clear.addEventListener('click', function () {
      search.value = ''; state.q = ''; clear.hidden = true; renderMenu(); search.focus();
    });

    $('#catChips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-cat]');
      if (!c) return;
      state.cat = c.dataset.cat;
      renderChips(); renderMenu();
      c.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      var top = $('#toolbar').offsetTop;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'smooth' });
    });

    $('#tagChips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-tag]');
      if (!c) return;
      var k = c.dataset.tag, i = state.tags.indexOf(k);
      if (i >= 0) state.tags.splice(i, 1); else state.tags.push(k);
      renderChips(); renderMenu();
    });

    $('#menu').addEventListener('click', function (e) {
      if (e.target.closest('#resetFilters')) {
        state.cat = 'all'; state.tags = []; state.q = ''; search.value = ''; clear.hidden = true;
        renderChips(); renderMenu();
        return;
      }
      var add = e.target.closest('[data-add]');
      if (add) {
        e.stopPropagation();
        var item = T.getItem(add.dataset.add);
        // Ajout express si le plat n'a aucune option obligatoire.
        if (item && !(item.options || []).some(function (g) { return g.required; })) {
          if (addToCart(item.id, 1, {}, '')) UI.toast('<strong>' + esc(item.name) + '</strong> ajouté au panier', 1800);
          return;
        }
        return openProduct(add.dataset.add);
      }
      var dish = e.target.closest('.dish');
      if (dish) openProduct(dish.dataset.id);
    });
    $('#menu').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('dish')) {
        e.preventDefault(); openProduct(e.target.dataset.id);
      }
    });

    $('#cartBar').addEventListener('click', openCart);
    $('#trackPill').addEventListener('click', openOrdersList);
    $('#trackRoot').addEventListener('click', function (e) {
      if (e.target.closest('[data-close-track]')) hideTracking();
      var chk = e.target.closest('[data-check-pay]');
      if (chk) { chk.disabled = true; chk.textContent = 'Vérification…'; confirmPayment(chk.dataset.checkPay, 2); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.trackingId) hideTracking();
    });

    var toolbar = $('#toolbar');
    var onScroll = function () { toolbar.classList.toggle('is-stuck', toolbar.getBoundingClientRect().top <= 0.5); };
    window.addEventListener('scroll', onScroll, { passive: true });

    /* Temps réel : statuts envoyés par la cuisine, menu modifié par le restaurateur. */
    T.subscribe(function (msg) {
      if (msg.type === 'order:updated' && msg.payload && state.mine.indexOf(msg.payload.id) >= 0) {
        var o = msg.payload;
        if (state.trackingId === o.id) {
          $('#trackRoot .track').innerHTML = trackHTML(o);
        } else {
          UI.toast('<strong>Commande n° ' + o.number + '</strong> · ' + esc(T.statusInfo(o.status).client), 4000);
        }
        if (o.status === 'prete' || o.status === 'servie') UI.vibrate([60, 60, 60]);
        if (o.status === 'terminee') askReview(o);
        renderTrackPill();
      }
      if (msg.type === 'servers:updated') {
        renderHeader();
        var tr = state.trackingId && T.getOrder(state.trackingId);
        if (tr) $('#trackRoot .track').innerHTML = trackHTML(tr);
      }
      if (msg.type === 'orders:sync') {
        // Commande terminée pendant que la page était fermée (moins de 20 min).
        state.mine.forEach(function (id) {
          var done = T.getOrder(id);
          var at = done && done.status === 'terminee' && (done.history || []).filter(function (h) { return h.status === 'terminee'; }).pop();
          if (at && Date.now() - at.at < 20 * 60000) askReview(done);
        });
        var cur = state.trackingId && T.getOrder(state.trackingId);
        if (cur) $('#trackRoot .track').innerHTML = trackHTML(cur);
        renderTrackPill();
      }
      if (msg.type === 'stock:updated') { renderChips(); renderMenu(); renderCartBar(); }
      if (msg.type === 'menu:updated' || msg.type === 'demo:reset') {
        state.menu = T.getMenu();
        renderChips(); renderMenu(); renderCartBar();
      }
      if (msg.type === 'restaurant:updated' || msg.type === 'demo:reset') {
        state.restaurant = T.getRestaurant();
        renderHeader();
      }
    });
  }

  function start() {
    state.restaurant = T.getRestaurant();
    state.menu = T.getMenu();
    renderHeader();
    renderChips();
    renderMenu();
    renderCartBar();
    renderTrackPill();
    bind();
    T.track(state.mine);

    $('#tableBadge').addEventListener('click', function () { openTablePicker(); });
    $('#serviceBtn').addEventListener('click', openService);
    $('#welcome').addEventListener('click', function (e) {
      if (e.target.closest('[data-change-table]')) openTablePicker();
    });
    var back = new URLSearchParams(location.search);
    if (LIVE && (back.get('paid') || back.get('cancel'))) paymentReturn(back.get('paid') || back.get('cancel'), !!back.get('paid'));

    if (table && tableError(table)) { table = null; renderHeader(); }
    if (!table) {
      var saved = null;
      try { saved = sessionStorage.getItem('tapigo.v1.table.' + scope); } catch (e) { /* ignore */ }
      if (saved && !tableError(saved)) setTable(saved);
      else openTablePicker();
    }
  }

  T.ready.then(function () {
    return LIVE ? T.openRestaurant(slug) : null;
  }).then(function () {
    // L'adresse canonique contient l'identifiant du restaurant.
    var cur = LIVE && T.currentRestaurant();
    if (cur && !slug) {
      slug = cur.slug;
      try {
        var q = new URLSearchParams(location.search);
        q.set('r', slug);
        history.replaceState(null, '', '?' + q.toString());
      } catch (e) { /* ignore */ }
    }
    start();
  }).catch(function (err) {
    var lost = err && err.code === 'NOT_FOUND';
    // Écran d'erreur épuré : rien d'inutilisable autour du message.
    ['#toolbar', '#welcome', '#tableBadge', '#serviceBtn', '#pauseBanner'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) el.hidden = true;
    });
    var title = !lost ? 'Menu momentanément indisponible'
      : err.reason === 'closed' ? 'Commandes en pause'
      : err.reason === 'old-link' ? 'Lien à mettre à jour'
      : 'Restaurant introuvable';
    $('#rName').textContent = lost ? 'Tapigo' : 'Menu';
    $('#menu').innerHTML = '<div class="empty"><h3>' + title + '</h3><p>' + esc(err.message) + '</p>' +
      (err && err.reason === 'old-link' ? '' : '<p style="margin-top:16px"><button class="btn btn--primary" type="button" onclick="location.reload()">Réessayer</button></p>') +
      '<p class="help" style="margin-top:18px;word-break:break-all">' + esc(location.href) + '</p></div>';
  });
})();
