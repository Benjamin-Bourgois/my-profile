/* ==========================================================================
   Tapigo — Dashboard restaurateur (Cuisine / Bar)
   Commandes temps réel · alertes sonores · statuts · édition du menu
   ========================================================================== */
(function () {
  'use strict';

  var T = Tapigo, UI = TapigoUI, I = UI.ICONS, esc = T.esc, fmt = T.fmt;
  var LIVE = T.mode === 'live';
  var $ = function (s, root) { return (root || document).querySelector(s); };

  var SOUND_KEY = 'tapigo.v1.kitchen.sound';
  var PREFS_KEY = 'tapigo.v1.kitchen.prefs';
  var prefs = T.read(PREFS_KEY, { layout: 'status', station: 'all' });

  var state = {
    view: 'orders',
    layout: prefs.layout,
    station: prefs.station,
    sound: T.read(SOUND_KEY, false),
    q: ''
  };

  var FLOW = ['nouvelle', 'preparation', 'prete', 'servie', 'terminee'];
  var COLUMNS = [
    { id: 'nouvelle', label: 'Nouvelles', color: 'var(--danger)' },
    { id: 'preparation', label: 'En préparation', color: 'var(--warn)' },
    { id: 'prete', label: 'Prêtes', color: 'var(--ok)' },
    { id: 'servie', label: 'Servies', color: 'var(--info)' }
  ];
  var ACTIONS = [
    { id: 'preparation', label: 'En préparation' },
    { id: 'prete', label: 'Prête' },
    { id: 'servie', label: 'Servie' }
  ];
  var PAY = { applepay: 'Apple Pay', card: 'Carte', onsite: 'Sur place', online: 'en ligne' };
  // Payer à table : ce que le client a annoncé (le serveur vient avec le terminal ou la monnaie).
  var WITH = { cash: 'Espèces', card: 'Carte', mixed: 'Espèces + carte' };
  function payLabel(o) {
    var w = o.payment.with && WITH[o.payment.with];
    if (o.payment.status === 'paid') return 'Payé · ' + (o.payment.method === 'onsite' && w ? w : PAY[o.payment.method]);
    return 'À encaisser' + (w ? ' · ' + w : '');
  }

  function savePrefs() { T.write(PREFS_KEY, { layout: state.layout, station: state.station }); }

  /* ======================================================================
     Commandes
     ====================================================================== */
  function activeOrders() {
    return T.getOrders().filter(function (o) { return o.status !== 'terminee'; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
  }

  function forStation(o) {
    return state.station === 'all' || o.lines.some(function (l) { return l.station === state.station; });
  }

  function timerHTML(o) {
    var m = T.minutesSince(o.createdAt);
    var cls = o.status === 'servie' ? '' : m >= 20 ? ' timer--late' : m >= 10 ? ' timer--warn' : '';
    return '<span class="timer' + cls + '" data-since="' + o.createdAt + '" data-status="' + o.status + '">' + m + ' min</span>';
  }

  function ticketHTML(o) {
    var cur = FLOW.indexOf(o.status);
    var col = COLUMNS.filter(function (c) { return c.id === o.status; })[0];
    var paid = o.payment.status === 'paid';
    var items = o.lines.reduce(function (s, l) { return s + l.qty; }, 0);

    return '<article class="ticket' + (o.seen ? '' : ' is-new') + '" data-order="' + esc(o.id) + '" style="--st:' + (col ? col.color : 'var(--line)') + '">' +
      '<header class="ticket__head">' +
        '<div class="ticket__table"><div><small>Table</small><b>' + esc(o.table) + '</b></div></div>' +
        '<div class="ticket__meta"><strong>N° ' + o.number + (o.seen ? '' : ' · <span style="color:var(--danger)">Nouvelle</span>') + '</strong>' +
          (o.source === 'serveur' ? '<span class="badge badge--info">Prise en salle</span> ' : '') +
          '<span>' + T.clock(o.createdAt) + ' · ' + items + ' article' + (items > 1 ? 's' : '') +
            (T.getTableServer(o.table) ? ' · ' + esc(T.getTableServer(o.table)) : '') + '</span></div>' +
        timerHTML(o) +
      '</header>' +
      '<ul class="ticket__lines">' + o.lines.map(function (l) {
        var other = state.station !== 'all' && l.station !== state.station;
        return '<li class="ticket__line' + (other ? ' is-other' : '') + '"><span class="q">' + l.qty + '×</span><div>' +
          '<div class="n">' + esc(l.name) + (l.station === 'bar' ? ' <span class="badge badge--info">Bar</span>' : '') + '</div>' +
          l.options.map(function (op) { return '<div class="o">' + esc(op.group) + ' : ' + esc(op.values.join(', ')) + '</div>'; }).join('') +
          (l.note ? '<div class="note">⚠ ' + esc(l.note) + '</div>' : '') +
        '</div></li>';
      }).join('') + '</ul>' +
      (o.note ? '<p class="ticket__note">📝 ' + esc(o.note) + '</p>' : '') +
      '<div class="ticket__foot"><span class="badge ' + (paid ? 'badge--ok' : 'badge--warn') + '">' +
        payLabel(o) + '</span>' +
        (o.tip ? '<span class="badge badge--ok" title="Pourboire payé en ligne">+ ' + fmt(o.tip) + ' pourboire</span>' : '') +
        '<button class="link-btn" type="button" data-print title="Imprimer le ticket">🖨 Imprimer</button>' +
        '<strong>' + fmt(o.total) + '</strong></div>' +
      '<div class="ticket__actions">' + ACTIONS.map(function (a) {
        var i = FLOW.indexOf(a.id);
        var cls = i === cur ? ' is-active' : i === cur + 1 ? ' is-next' : i < cur ? ' is-past' : '';
        return '<button class="st-btn' + cls + '" type="button" data-status="' + a.id + '"' + (i === cur ? ' aria-current="true"' : '') + '>' + a.label + '</button>';
      }).join('') +
        // Valider d'un coup, quel que soit l'avancement : la commande passe en « Terminée » (et encaissée).
        '<button class="st-validate" type="button" data-validate>' + I.check.replace('<svg ', '<svg width="14" height="14" ') + ' Valider la commande</button>' +
      '</div>' +
    '</article>';
  }

  function statsHTML(all) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todays = T.getOrders().filter(function (o) { return o.createdAt >= today.getTime(); });
    var count = function (s) { return all.filter(function (o) { return o.status === s; }).length; };
    return '<div class="k-stats">' +
      '<div class="k-stat"><span>À traiter</span><b>' + count('nouvelle') + '</b></div>' +
      '<div class="k-stat"><span>En préparation</span><b>' + count('preparation') + '</b></div>' +
      '<div class="k-stat"><span>Prêtes à servir</span><b>' + count('prete') + '</b></div>' +
      '<div class="k-stat"><span>Chiffre du service</span><b>' + fmt(todays.reduce(function (s, o) { return s + o.total; }, 0)) + '</b></div>' +
    '</div>';
  }

  function seg(name, current, options) {
    return '<div class="seg" role="group">' + options.map(function (o) {
      return '<button type="button" data-' + name + '="' + o[0] + '" aria-pressed="' + (current === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  // Paiements en ligne pas encore confirmés par Stripe (pas encore en cuisine).
  function awaitingHTML() {
    var list = T.payments && T.payments.awaiting ? T.payments.awaiting() : [];
    if (!list.length) return '';
    return '<div class="requests" role="region" aria-label="Paiements en cours">' + list.map(function (o) {
      return '<div class="request request--pay">' +
        '<span class="request__icon" aria-hidden="true">💳</span>' +
        '<span class="request__text"><strong>Table ' + esc(o.table) + '</strong> paie en ligne · ' + fmt(o.total + (o.tip || 0)) +
          '<small>commande n° ' + o.number + ' · il y a ' + T.minutesSince(o.createdAt) + ' min · arrive en cuisine dès le paiement validé</small></span>' +
        '<span class="request__actions">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-check-pay="' + esc(o.id) + '">Vérifier</button>' +
          '<button class="btn btn--primary btn--sm" type="button" data-pay-onsite="' + esc(o.id) + '">Encaissé à table</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-pay-cancel="' + esc(o.id) + '">Annuler</button>' +
        '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  // Le client devait payer en ligne mais a réglé à table : on note comment, la commande part en cuisine.
  function openOnsitePay(po) {
    UI.openSheet({
      label: 'Encaissé à table',
      head: '<p class="eyebrow">Table ' + esc(po.table) + ' · commande n° ' + po.number + '</p><h2>Encaissé à table</h2>',
      body: '<p class="help">Le client a réglé <strong>' + fmt(po.total) + '</strong> sur place. La page de paiement en ligne est fermée et la commande part en cuisine, notée payée.</p>' +
        '<div class="tip-chips onsite-chips" style="margin-top:14px">' +
          '<button type="button" class="tip-chip" data-onsite-with="cash"><b>Espèces</b><small>en liquide</small></button>' +
          '<button type="button" class="tip-chip" data-onsite-with="card"><b>Carte</b><small>terminal</small></button>' +
          '<button type="button" class="tip-chip" data-onsite-with="mixed"><b>Les deux</b><small>espèces + carte</small></button>' +
        '</div>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-onsite-with]');
          if (!b || b.disabled) return;
          sheet.querySelectorAll('[data-onsite-with]').forEach(function (x) { x.disabled = true; });
          b.innerHTML = '<span class="spinner"></span>';
          T.payments.onsite(po.id, b.dataset.onsiteWith).then(function (r) {
            UI.closeSheet();
            UI.toast(r.onsite ? 'Commande n° ' + po.number + ' encaissée à table : elle arrive en cuisine' : 'Déjà payée en ligne : la commande arrive en cuisine', 5000);
            renderOrders();
          }, function (err) {
            UI.closeSheet();
            UI.toast(esc(err.message), 5000);
            renderOrders();
          });
        });
      }
    });
  }

  function requestsHTML() {
    var list = T.getServiceRequests();
    if (!list.length) return '';
    return '<div class="requests" role="region" aria-label="Appels des tables">' + list.map(function (q) {
      var m = T.minutesSince(Date.parse(q.created_at));
      return '<div class="request request--' + esc(q.kind) + '">' +
        '<span class="request__icon" aria-hidden="true">' + (q.kind === 'addition' ? '🧾' : '🙋') + '</span>' +
        '<span class="request__text"><strong>Table ' + esc(q.table_label) + '</strong> ' +
          (q.kind === 'addition' ? 'demande l’addition' : 'appelle un serveur') +
          '<small>il y a ' + m + ' min</small></span>' +
        '<button class="btn btn--primary btn--sm" type="button" data-request-done="' + esc(q.id) + '">C’est fait</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderOrders() {
    var all = activeOrders();
    var shown = all.filter(forStation);
    var html = requestsHTML() + awaitingHTML() + statsHTML(all) +
      '<div class="k-filters">' +
        '<button class="btn btn--primary btn--sm" type="button" data-new-order>+ Prendre une commande</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-servers>Serveurs des tables</button>' +
        seg('layout', state.layout, [['status', 'Par statut'], ['table', 'Par table']]) +
        seg('station', state.station, [['all', 'Tout'], ['cuisine', 'Cuisine'], ['bar', 'Bar']]) +
        (state.sound ? '' : '<button class="btn btn--soft btn--sm" type="button" data-enable-sound>' + I.bell.replace('<svg ', '<svg width="16" height="16" ') + ' Activer les alertes sonores</button>') +
      '</div>';

    if (state.layout === 'status') {
      html += '<div class="board">' + COLUMNS.map(function (c) {
        var list = shown.filter(function (o) { return o.status === c.id; });
        return '<section class="col" aria-label="' + c.label + '"><div class="col__head"><h2><span class="col__dot" style="background:' + c.color + '"></span>' + c.label + '</h2>' +
          '<span class="badge">' + list.length + '</span></div><div class="col__list">' +
          (list.length ? list.map(ticketHTML).join('') : '<div class="col__empty">Aucune commande</div>') +
          '</div></section>';
      }).join('') + '</div>';
    } else {
      var tables = {};
      shown.forEach(function (o) { (tables[o.table] = tables[o.table] || []).push(o); });
      var keys = Object.keys(tables).sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b); });
      html += keys.length
        ? '<div class="tables-grid">' + keys.map(function (k) {
            var list = tables[k];
            var unpaid = list.filter(function (o) { return o.payment.status !== 'paid'; });
            var due = unpaid.reduce(function (s, o) { return s + o.total; }, 0);
            var ways = unpaid.map(function (o) { return o.payment.with; }).filter(function (w, i, a) { return WITH[w] && a.indexOf(w) === i; });
            var how = ways.length === 1 ? ' · ' + WITH[ways[0]] : ways.length > 1 ? ' · ' + WITH.mixed : '';
            var total = list.reduce(function (s, o) { return s + o.total; }, 0);
            var srv = T.getTableServer(k);
            return '<section class="table-group"><div class="table-group__head"><h2>Table ' + esc(k) +
              '<button class="table-server" type="button" data-servers="' + esc(k) + '">' + (srv ? esc(srv) : '+ serveur') + '</button></h2>' +
              (due ? '<span class="badge badge--warn">À encaisser ' + fmt(due) + how + '</span>' : '<span class="badge badge--ok">Réglée</span>') + '</div>' +
              list.map(ticketHTML).join('') +
              '<div class="table-group__foot"><span>Total de la table <strong>' + fmt(total) + '</strong></span>' +
              '<span style="display:flex;gap:6px;flex-wrap:wrap">' +
                '<button class="btn btn--ghost btn--sm" type="button" data-new-order="' + esc(k) + '">+ Ajouter</button>' +
                '<button class="btn btn--primary btn--sm" type="button" data-close-table="' + esc(k) + '">Encaisser &amp; clôturer</button></span></div>' +
              '</section>';
          }).join('') + '</div>'
        : '<div class="empty"><h3>Service calme</h3><p>Aucune commande en cours. Les nouvelles commandes apparaîtront ici instantanément.</p></div>';
    }

    var done = T.getOrders().filter(function (o) { return o.status === 'terminee'; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (done.length) {
      html += '<details class="k-history"><summary>Historique · ' + done.length + ' commande' + (done.length > 1 ? 's' : '') + ' terminée' + (done.length > 1 ? 's' : '') + '</summary>' +
        '<div style="overflow-x:auto"><table><thead><tr><th>N°</th><th>Table</th><th>Heure</th><th>Articles</th><th>Paiement</th><th>Total</th><th></th></tr></thead><tbody>' +
        done.slice(0, 30).map(function (o) {
          return '<tr><td>' + o.number + '</td><td>' + esc(o.table) + '</td><td>' + T.clock(o.createdAt) + '</td>' +
            '<td>' + esc(o.lines.map(function (l) { return l.qty + '× ' + l.name; }).join(', ')) + '</td>' +
            '<td>' + (o.payment.method === 'onsite' && WITH[o.payment.with] ? WITH[o.payment.with] : PAY[o.payment.method]) + '</td><td>' + fmt(o.total) + '</td>' +
            '<td><button class="link-btn" type="button" data-reopen="' + esc(o.id) + '">Rouvrir</button></td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }

    var view = $('#ordersView');
    var openHistory = view.querySelector('.k-history[open]');
    var boardScroll = view.querySelector('.board') ? view.querySelector('.board').scrollLeft : 0;
    view.innerHTML = html;
    if (openHistory && view.querySelector('.k-history')) view.querySelector('.k-history').open = true;
    if (view.querySelector('.board')) view.querySelector('.board').scrollLeft = boardScroll;
    updateBadges();
  }

  function updateBadges() {
    var unseen = T.getOrders().filter(function (o) { return !o.seen && o.status !== 'terminee'; }).length;
    var c = $('#newCount');
    c.hidden = !unseen;
    c.textContent = unseen;
    document.title = (unseen ? '(' + unseen + ') ' : '') + 'Cuisine · ' + T.getRestaurant().name;
  }

  function tickTimers() {
    document.querySelectorAll('.timer[data-since]').forEach(function (el) {
      var m = T.minutesSince(+el.dataset.since);
      el.textContent = m + ' min';
      el.classList.toggle('timer--warn', el.dataset.status !== 'servie' && m >= 10 && m < 20);
      el.classList.toggle('timer--late', el.dataset.status !== 'servie' && m >= 20);
    });
    $('#kClock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------------- Nouvelle commande : son + visuel ---------------- */
  var suppressAnnounce = false;
  function announce(order) {
    if (suppressAnnounce) return;
    if (state.sound) UI.chime();
    UI.vibrate([80, 60, 80]);
    UI.toast('🔔 <strong>Nouvelle commande · Table ' + esc(order.table) + '</strong><br>' +
      order.lines.map(function (l) { return l.qty + '× ' + esc(l.name); }).join(', '), 5000);
  }

  /* Simule un client qui commande depuis sa table (démo). */
  function simulateOrder() {
    var r = T.getRestaurant();
    var items = T.getMenu().items.filter(function (i) { return i.available !== false; });
    if (!items.length) return UI.toast('Aucun produit disponible au menu');
    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    var n = 1 + Math.floor(Math.random() * 3);
    var lines = [];
    for (var k = 0; k < n; k++) {
      var item = pick(items), sel = {};
      (item.options || []).forEach(function (g) {
        if (g.required || Math.random() < .3) sel[g.id] = [pick(g.choices).label];
      });
      lines.push(T.buildLine(item.id, 1 + (Math.random() < .3 ? 1 : 0), sel, Math.random() < .2 ? pick(['Sans oignon', 'Sauce à part', 'Bien chaud svp', 'Sans gluten si possible']) : ''));
    }
    T.createOrder({
      table: 1 + Math.floor(Math.random() * (r.tables || 12)),
      lines: lines,
      note: Math.random() < .15 ? 'Anniversaire : une bougie au dessert 🎂' : '',
      payment: pick([{ method: 'applepay', status: 'paid' }, { method: 'card', status: 'paid' }, { method: 'onsite', status: 'pending' }])
    });
  }

  /* ======================================================================
     Éditeur de menu
     ====================================================================== */
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function renderMenuEditor() {
    var menu = T.getMenu();
    var q = norm(state.q);
    var off = menu.items.filter(function (i) { return i.available === false; }).length;

    if (LIVE && !menu.items.length) {
      $('#menuView').innerHTML = '<div class="editor"><div class="empty"><h3>La carte est vide</h3>' +
        '<p>Partez de la carte de démonstration et adaptez-la, ou ajoutez vos plats un par un.</p>' +
        '<p style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn btn--primary" type="button" data-import-demo>Importer la carte de démonstration</button>' +
          '<button class="btn btn--ghost" type="button" data-new>Ajouter un plat</button>' +
          '<button class="btn btn--ghost" type="button" data-settings>Établissement</button></p></div></div>';
      return;
    }
    if (!menu.categories.length) menu.categories = window.TAPIGO_DEMO.categories;

    var html = '<div class="editor">' +
      '<div class="editor__bar">' +
        '<label class="search">' + I.search + '<input id="menuSearch" type="search" placeholder="Rechercher un produit…" value="' + esc(state.q) + '" aria-label="Rechercher un produit"></label>' +
        '<button class="btn btn--primary" type="button" data-new>' + I.plus.replace('<svg ', '<svg width="16" height="16" ') + ' Ajouter un plat</button>' +
        '<button class="btn btn--ghost" type="button" data-categories>Catégories</button>' +
        (window.TapigoI18n ? '<button class="btn btn--ghost" type="button" data-langs>Langues</button>' : '') +
        '<button class="btn btn--ghost" type="button" data-settings>Établissement</button>' +
      '</div>' +
      '<p class="eyebrow">' + menu.items.length + ' produits · ' + off + ' en rupture (masqué' + (off > 1 ? 's' : '') + ' côté client)</p>' +
      menu.categories.map(function (c) {
        var list = menu.items.filter(function (i) { return i.category === c.id && (!q || norm(i.name + ' ' + i.description).indexOf(q) >= 0); });
        if (!list.length) {
          return q ? '' : '<section class="editor-cat"><h2>' + esc(c.label) + '</h2><p class="help">Aucun plat dans cette catégorie. ' +
            '<button class="link-btn" type="button" data-new="' + esc(c.id) + '">Ajouter un plat</button></p></section>';
        }
        return '<section class="editor-cat"><h2>' + esc(c.label) + '</h2><div class="editor-list">' + list.map(function (i) {
          var on = i.available !== false;
          return '<div class="editor-row' + (on ? '' : ' is-off') + '" data-item="' + esc(i.id) + '">' +
            UI.media(i, 'editor-row__thumb') +
            '<div class="editor-row__name"><strong>' + esc(i.name) + '</strong><span>' +
              (i.station === 'bar' ? 'Bar' : 'Cuisine') + ((i.options || []).length ? ' · ' + i.options.length + ' option' + (i.options.length > 1 ? 's' : '') : '') + '</span></div>' +
            '<div class="price-input"><input type="text" inputmode="decimal" value="' + String(i.price).replace('.', ',') + '" data-price aria-label="Prix de ' + esc(i.name) + '"></div>' +
            '<label class="switch editor-row__toggle"><input type="checkbox" data-avail' + (on ? ' checked' : '') + '><span class="switch__track"></span><span>' + (on ? 'En stock' : 'Rupture') + '</span></label>' +
            '<div class="editor-row__actions">' +
              '<button class="icon-btn" type="button" data-edit aria-label="Modifier ' + esc(i.name) + '">' + I.edit + '</button>' +
              '<button class="icon-btn" type="button" data-delete aria-label="Supprimer ' + esc(i.name) + '">' + I.trash + '</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div></section>';
      }).join('') +
      (LIVE ? '' : '<div style="text-align:center;padding-top:12px"><button class="btn btn--danger btn--sm" type="button" data-reset>' + I.reset.replace('<svg ', '<svg width="14" height="14" ') + ' Réinitialiser les données de démo</button></div>') +
    '</div>';

    var view = $('#menuView');
    var focusSearch = document.activeElement && document.activeElement.id === 'menuSearch';
    var caret = focusSearch ? document.activeElement.selectionStart : 0;
    view.innerHTML = html;
    if (focusSearch) { var s = $('#menuSearch'); s.focus(); s.setSelectionRange(caret, caret); }
  }

  function parsePrice(v) {
    var n = parseFloat(String(v).replace(/\s|€/g, '').replace(',', '.'));
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  function choicesToText(choices) {
    return (choices || []).map(function (c) { return c.label + (Number(c.price) ? ' +' + String(c.price).replace('.', ',') : ''); }).join(', ');
  }

  function textToChoices(text) {
    return String(text || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
      var m = /^(.*?)\s*\+\s*(\d+(?:[.,]\d+)?)\s*€?$/.exec(s);
      return m ? { label: m[1].trim(), price: parsePrice(m[2]) || 0 } : { label: s, price: 0 };
    });
  }

  function groupEditHTML(g) {
    return '<div class="optgroup-edit" data-gid="' + esc(g.id || '') + '">' +
      '<label class="field"><span>Nom du groupe</span><input data-g="name" value="' + esc(g.name || '') + '" placeholder="Ex : Cuisson"></label>' +
      '<label class="field"><span>Type</span><select data-g="type">' +
        '<option value="single"' + (g.type !== 'multi' ? ' selected' : '') + '>Choix unique</option>' +
        '<option value="multi"' + (g.type === 'multi' ? ' selected' : '') + '>Choix multiple</option></select></label>' +
      '<label class="switch"><input type="checkbox" data-g="required"' + (g.required ? ' checked' : '') + '><span class="switch__track"></span><span>Obligatoire</span></label>' +
      '<button class="icon-btn" type="button" data-remove-group aria-label="Supprimer le groupe">' + I.trash + '</button>' +
      '<label class="field span-all"><span>Choix (séparés par des virgules, « +2 » pour un supplément)</span>' +
        '<input data-g="choices" value="' + esc(choicesToText(g.choices)) + '" placeholder="Saignante, À point, Purée truffée +3"></label>' +
    '</div>';
  }

  function openItemForm(id, categoryId) {
    var menu = T.getMenu();
    if (!menu.categories.length) { menu.categories = window.TAPIGO_DEMO.categories; menu.tags = window.TAPIGO_DEMO.tags; }
    var item = id ? T.getItem(id) : { name: '', description: '', price: '', category: categoryId || menu.categories[0].id, station: 'cuisine', image: '', emoji: '🍽️', tags: [], allergens: '', available: true, options: [] };
    if (!item) return;
    var tags = menu.tags || {};
    var hasAllergen = T.itemAllergens(item).map(function (a) { return a.id; });
    var others = menu.items.filter(function (i) { return i.id !== item.id; });

    UI.openSheet({
      label: id ? 'Modifier un produit' : 'Nouveau produit',
      head: '<p class="eyebrow">' + (id ? 'Modifier' : 'Nouveau produit') + '</p><h2>' + (id ? esc(item.name) : 'Ajouter un plat') + '</h2>',
      body:
        '<form id="itemForm" class="form-grid" novalidate>' +
          '<label class="field span-2"><span>Nom</span><input name="name" required maxlength="60" value="' + esc(item.name) + '" autofocus></label>' +
          '<label class="field span-2"><span>Description</span><textarea name="description" maxlength="200">' + esc(item.description) + '</textarea></label>' +
          '<label class="field"><span>Prix (€)</span><input name="price" inputmode="decimal" required value="' + esc(String(item.price).replace('.', ',')) + '" placeholder="18,50"></label>' +
          '<label class="field"><span>Catégorie</span><select name="category">' + menu.categories.map(function (c) {
            return '<option value="' + esc(c.id) + '"' + (c.id === item.category ? ' selected' : '') + '>' + esc(c.label) + '</option>';
          }).join('') + '</select></label>' +
          '<label class="field"><span>Poste</span><select name="station">' +
            '<option value="cuisine"' + (item.station !== 'bar' ? ' selected' : '') + '>Cuisine</option>' +
            '<option value="bar"' + (item.station === 'bar' ? ' selected' : '') + '>Bar</option></select></label>' +
          // Pas encore renseigné : coché d'office pour un produit du bar.
          '<label class="switch span-2"><input type="checkbox" name="alcohol"' + (item.alcohol === true || (item.alcohol == null && item.station === 'bar') ? ' checked' : '') + '>' +
            '<span class="switch__track"></span><span>Contient de l’alcool <small class="help">TVA sur place 20 % (10 % sans alcool), mention sur la carte</small></span></label>' +
          '<label class="field"><span>Emoji (si pas de photo)</span><input name="emoji" maxlength="4" value="' + esc(item.emoji || '') + '"></label>' +
          '<div class="field span-2"><span>Photo</span><div class="photo-field">' +
            '<div class="media photo-field__preview" id="photoPreview" data-emoji="' + esc(item.emoji || '🍽️') + '">' + (item.image ? '<img src="' + esc(item.image) + '" alt="">' : '') + '</div>' +
            '<div class="photo-field__actions">' +
              '<label class="btn btn--soft btn--sm">📷 ' + (item.image ? 'Changer la photo' : 'Ajouter une photo') + '<input type="file" accept="image/*" id="photoInput" hidden></label>' +
              '<button class="link-btn link-btn--danger" type="button" data-remove-photo' + (item.image ? '' : ' hidden') + '>Retirer la photo</button>' +
              '<small class="help" id="photoHelp">Prise depuis le téléphone ou la galerie, réduite automatiquement.</small>' +
            '</div></div>' +
            '<input name="image" type="url" value="' + esc(item.image || '') + '" placeholder="ou collez l’adresse d’une image (https://…)" style="margin-top:8px"></div>' +
          '<div class="field span-2"><span>Allergènes (14 allergènes réglementaires)</span><div class="check-row check-row--sm">' +
            window.TAPIGO_DEMO.allergens.map(function (a) {
              return '<label><input type="checkbox" name="allergen" value="' + a.id + '"' + (hasAllergen.indexOf(a.id) >= 0 ? ' checked' : '') + '> ' + esc(a.label) + '</label>';
            }).join('') + '</div></div>' +
          (others.length ? '<div class="field span-2"><span>Suggérer avec (« Parfait avec », 3 maximum)</span><div class="check-row check-row--sm">' +
            others.map(function (o) {
              return '<label><input type="checkbox" name="pairing" value="' + esc(o.id) + '"' + ((item.pairings || []).indexOf(o.id) >= 0 ? ' checked' : '') + '> ' + esc(o.name) + '</label>';
            }).join('') + '</div></div>' : '') +
          '<div class="field span-2"><span>Étiquettes</span><div class="check-row">' + Object.keys(tags).map(function (k) {
            return '<label><input type="checkbox" name="tags" value="' + esc(k) + '"' + ((item.tags || []).indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(tags[k]) + '</label>';
          }).join('') + '</div></div>' +
          '<div class="field span-2"><span>Options &amp; variantes</span><div id="groups" style="display:grid;gap:10px">' +
            (item.options || []).map(groupEditHTML).join('') +
          '</div><button class="btn btn--soft btn--sm" type="button" data-add-group style="justify-self:start;margin-top:4px">+ Ajouter un groupe d’options</button></div>' +
          '<label class="switch span-2"><input type="checkbox" name="available"' + (item.available !== false ? ' checked' : '') + '><span class="switch__track"></span><span>Disponible à la commande</span></label>' +
        '</form>',
      footer:
        (id ? '<button class="btn btn--ghost" type="button" data-cancel>Annuler</button>' : '') +
        '<button class="btn btn--primary" type="submit" form="itemForm">' + (id ? 'Enregistrer' : 'Ajouter au menu') + '</button>',
      onMount: function (sheet) {
        var form = $('#itemForm', sheet);
        var preview = $('#photoPreview', sheet);
        var setPhoto = function (url) {
          form.elements.image.value = url || '';
          preview.classList.remove('is-broken');
          preview.innerHTML = url ? '<img src="' + esc(url) + '" alt="">' : '';
          sheet.querySelector('[data-remove-photo]').hidden = !url;
        };
        $('#photoInput', sheet).addEventListener('change', function (e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          var help = $('#photoHelp', sheet);
          help.textContent = 'Envoi de la photo…';
          T.uploadPhoto(file).then(function (url) {
            setPhoto(url);
            help.textContent = 'Photo ajoutée ✓';
          }).catch(function (err) {
            help.textContent = err.message;
            UI.toast(esc(err.message), 5000);
          });
          e.target.value = '';
        });
        form.elements.image.addEventListener('change', function () { setPhoto(form.elements.image.value.trim()); });
        form.addEventListener('change', function (e) {
          if (e.target.name === 'pairing' && form.querySelectorAll('[name="pairing"]:checked').length > 3) {
            e.target.checked = false;
            UI.toast('3 suggestions maximum');
          }
        });
        sheet.addEventListener('click', function (e) {
          if (e.target.closest('[data-remove-photo]')) setPhoto('');
          if (e.target.closest('[data-add-group]')) {
            $('#groups', sheet).insertAdjacentHTML('beforeend', groupEditHTML({ type: 'single', required: false, choices: [] }));
            $('#groups .optgroup-edit:last-child input', sheet).focus();
          }
          var rm = e.target.closest('[data-remove-group]');
          if (rm) rm.closest('.optgroup-edit').remove();
          if (e.target.closest('[data-cancel]')) UI.closeSheet();
        });
        var checkedValues = function (name) {
          return [].slice.call(form.querySelectorAll('[name="' + name + '"]:checked')).map(function (i) { return i.value; });
        };
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var f = form.elements;
          var price = parsePrice(f.price.value);
          if (!f.name.value.trim()) { f.name.style.borderColor = 'var(--danger)'; f.name.focus(); return UI.toast('Le nom est obligatoire'); }
          if (price == null) { f.price.style.borderColor = 'var(--danger)'; f.price.focus(); return UI.toast('Prix invalide'); }

          var options = [].slice.call(sheet.querySelectorAll('.optgroup-edit')).map(function (el) {
            var name = el.querySelector('[data-g="name"]').value.trim();
            var choices = textToChoices(el.querySelector('[data-g="choices"]').value);
            if (!name || !choices.length) return null;
            return {
              id: el.dataset.gid || 'g-' + Math.random().toString(36).slice(2, 8),
              name: name,
              type: el.querySelector('[data-g="type"]').value,
              required: el.querySelector('[data-g="required"]').checked,
              choices: choices
            };
          }).filter(Boolean);

          var saved = T.saveItem({
            id: item.id,
            name: f.name.value.trim(),
            description: f.description.value.trim(),
            price: price,
            category: f.category.value,
            station: f.station.value,
            emoji: f.emoji.value.trim() || '🍽️',
            image: f.image.value.trim(),
            allergenList: checkedValues('allergen'),
            allergens: window.TAPIGO_DEMO.allergens.filter(function (a) { return checkedValues('allergen').indexOf(a.id) >= 0; })
              .map(function (a) { return a.label; }).join(', '),
            pairings: checkedValues('pairing'),
            tags: checkedValues('tags'),
            alcohol: f.alcohol.checked,
            available: f.available.checked,
            options: options
          });
          UI.closeSheet();
          UI.toast('<strong>' + esc(saved.name) + '</strong> ' + (id ? 'mis à jour' : 'ajouté au menu'));
        });
      }
    });
  }

  // Un seul lien pour toutes les plaques : le client saisit son numéro de table.
  function nfcLink() {
    var base = location.href.replace(/kitchen\.html.*$/, 'menu.html');
    var cur = LIVE && T.currentRestaurant();
    return base + (cur ? '?r=' + cur.slug : '');
  }

  function onsiteSet(r) {
    var w = Array.isArray(r.onsiteWith) ? r.onsiteWith : [];
    return w.length ? w : ['cash', 'card'];
  }

  /* Carte multilingue : langues proposées aux clients et traduction par l'IA. */
  function openLanguages() {
    var L = window.TapigoI18n, info = T.getRestaurant(), chosen = (info.languages || []).slice();
    var langs = L.LANGS.filter(function (l) { return l.id !== 'fr'; });
    var status = function (id) {
      var menu = T.getMenu(), pack = menu.i18n && menu.i18n[id], items = menu.items || [];
      var done = items.filter(function (i) { var x = pack && pack.items && pack.items[i.id]; return x && x.src === L.srcOf(i); }).length;
      return { done: done, total: items.length };
    };
    var body = function () {
      return '<p class="help" style="margin-bottom:12px">Les clients choisissent leur langue sur la carte (celle de leur téléphone est proposée d’office). ' +
          'Les boutons, le panier et le suivi sont déjà traduits ; vos plats, descriptions et options sont traduits par l’IA. ' +
          'La cuisine reçoit toujours les commandes en français.</p>' +
        '<div class="lang-list">' + langs.map(function (l) {
          var st = status(l.id), on = chosen.indexOf(l.id) >= 0;
          return '<label class="lang-row"><input type="checkbox" data-lang-on="' + l.id + '"' + (on ? ' checked' : '') + '>' +
            '<span class="lang-row__name">' + l.flag + ' ' + esc(l.label) + '</span>' +
            '<span class="badge ' + (st.done === st.total ? 'badge--ok' : st.done ? 'badge--warn' : '') + '">' +
              (st.done === st.total ? 'carte traduite' : st.done ? (st.total - st.done) + ' produit' + (st.total - st.done > 1 ? 's' : '') + ' à traduire' : 'pas encore traduite') + '</span></label>';
        }).join('') + '</div>' +
        '<p class="help" style="margin-top:10px">Un plat modifié s’affiche en français dans les autres langues jusqu’à la prochaine traduction : relancez « Traduire » après vos changements (seuls les nouveaux textes sont traduits).</p>';
    };
    UI.openSheet({
      label: 'Langues de la carte',
      head: '<p class="eyebrow">Carte multilingue</p><h2>Langues de la carte</h2>',
      body: '<div id="langBody">' + body() + '</div>',
      footer: '<button class="btn btn--ghost" type="button" id="langSave">Enregistrer</button>' +
        '<button class="btn btn--primary" type="button" id="langTranslate">' + I.bolt.replace('<svg ', '<svg width="16" height="16" ') + ' Traduire avec l’IA</button>',
      onMount: function (sheet) {
        var box = $('#langBody', sheet);
        box.addEventListener('change', function (e) {
          var c = e.target.closest('[data-lang-on]');
          if (!c) return;
          chosen = langs.map(function (l) { return l.id; }).filter(function (id) { return box.querySelector('[data-lang-on="' + id + '"]').checked; });
        });
        var save = function () {
          T.saveRestaurant(Object.assign(T.getRestaurant(), { languages: chosen }));
        };
        $('#langSave', sheet).addEventListener('click', function () {
          save(); UI.closeSheet();
          UI.toast(chosen.length ? 'Carte proposée en ' + chosen.length + ' langue' + (chosen.length > 1 ? 's' : '') + ' en plus du français' : 'Carte en français uniquement');
        });
        $('#langTranslate', sheet).addEventListener('click', function (e) {
          if (!chosen.length) return UI.toast('Cochez au moins une langue');
          var b = e.currentTarget;
          save();
          b.disabled = true; b.innerHTML = '<span class="spinner"></span> Traduction en cours… (jusqu’à une minute)';
          T.translateMenu(chosen).then(function (r) {
            UI.toast(r && r.total ? 'Carte traduite · ' + r.total + ' textes de produits' : 'La carte était déjà traduite', 4000);
            box.innerHTML = body();
          }, function (err) { UI.toast(esc(err.message), 6000); })
            .then(function () { b.disabled = false; b.innerHTML = I.bolt.replace('<svg ', '<svg width="16" height="16" ') + ' Traduire avec l’IA'; });
        });
      }
    });
  }

  function openSettings() {
    var r = T.getRestaurant();
    UI.openSheet({
      label: 'Établissement',
      head: '<p class="eyebrow">Paramètres</p><h2>Établissement</h2>',
      body:
        '<form id="settingsForm" class="form-grid" novalidate>' +
          '<label class="field span-2"><span>Nom du restaurant</span><input name="name" maxlength="50" value="' + esc(r.name) + '" autofocus></label>' +
          '<label class="field span-2"><span>Accroche</span><input name="tagline" maxlength="80" value="' + esc(r.tagline || '') + '"></label>' +
          '<label class="field"><span>Nombre de tables</span><input name="tables" inputmode="numeric" value="' + (r.tables || 12) + '"></label>' +
          '<label class="field"><span>Lettre du logo</span><input name="logoLetter" maxlength="1" value="' + esc(r.logoLetter || r.name.charAt(0)) + '"></label>' +
          '<fieldset class="span-2 onsite-set"><span>Moyens acceptés pour « Payer à table » (le client indique le sien en commandant)</span>' +
            '<label class="check-line"><input type="checkbox" name="withCash"' + (onsiteSet(r).indexOf('cash') >= 0 ? ' checked' : '') + '><span>Espèces</span></label>' +
            '<label class="check-line"><input type="checkbox" name="withCard"' + (onsiteSet(r).indexOf('card') >= 0 ? ' checked' : '') + '><span>Carte bancaire</span></label></fieldset>' +
          '<label class="check-line span-2"><input type="checkbox" name="tipsEnabled"' + (r.tipsEnabled === false ? '' : ' checked') + '>' +
            '<span>Proposer un pourboire lors du paiement en ligne (5 %, 10 %, 15 % ou montant libre)</span></label>' +
          '<label class="field span-2"><span>Lien d’avis Google (le client y est redirigé quand sa commande est terminée)</span>' +
            '<input name="reviewUrl" type="url" value="' + esc(r.reviewUrl || '') + '" placeholder="https://g.page/r/…/review">' +
            '<small class="help">Google Business Profile → « Demander des avis » → copier le lien.</small></label>' +
          '<label class="field span-2"><span>Lien à écrire sur toutes les plaques NFC (le client indique sa table)</span>' +
            '<input id="nfcLinks" readonly value="' + esc(nfcLink()) + '" style="font-size:13px;font-family:ui-monospace,Menlo,monospace">' +
            '<button class="btn btn--soft btn--sm" type="button" id="copyLinks" style="justify-self:start">Copier le lien</button></label>' +
        '</form>' +
        (LIVE && T.payments ? '<section class="pay-setup"><h3>Paiement en ligne</h3><div id="payBox"><p class="help"><span class="spinner"></span> Vérification…</p></div></section>' : ''),
      footer: '<button class="btn btn--primary" type="submit" form="settingsForm">Enregistrer</button>',
      onMount: function (sheet) {
        if (LIVE && T.payments) mountPayments($('#payBox', sheet));
        $('#copyLinks', sheet).addEventListener('click', function () {
          var ta = $('#nfcLinks', sheet);
          var ok = function () { UI.toast('Lien copié'); };
          if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(ok, function () { ta.select(); });
          else { ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* ignore */ } }
        });
        $('#settingsForm', sheet).addEventListener('submit', function (e) {
          e.preventDefault();
          var f = e.target.elements;
          var review = f.reviewUrl.value.trim();
          if (review && !/^https:\/\//i.test(review)) return UI.toast('Le lien d’avis doit commencer par https://');
          var withs = (f.withCash.checked ? ['cash'] : []).concat(f.withCard.checked ? ['card'] : []);
          if (!withs.length) return UI.toast('Cochez au moins un moyen de paiement à table : espèces ou carte.');
          var info = Object.assign({}, r, {
            name: f.name.value.trim() || r.name,
            tagline: f.tagline.value.trim(),
            tables: Math.max(1, Math.min(200, parseInt(f.tables.value, 10) || r.tables || 12)),
            logoLetter: f.logoLetter.value.trim(),
            reviewUrl: review,
            tipsEnabled: f.tipsEnabled.checked,
            onsiteWith: withs
          });
          T.saveRestaurant(info);
          UI.closeSheet();
          UI.toast('Établissement mis à jour');
        });
      }
    });
  }

  /* ======================================================================
     Paiement en ligne (Stripe Connect) — réservé au gérant
     ====================================================================== */
  function payBoxHTML(st) {
    var free = '<p class="help">Les paiements arrivent directement sur le compte Stripe du restaurant (virement automatique). ' +
      'Tapigo ne prend aucune commission : seuls les frais Stripe s’appliquent. Votre terminal reste utilisable pour « Payer à table ».</p>';
    if (!st.connected) {
      return '<p>Permettez à vos clients de payer depuis leur téléphone (carte, Apple Pay, Google Pay) au moment de commander.</p>' + free +
        '<button class="btn btn--primary btn--sm" type="button" data-pay-onboard>Connecter mon compte Stripe</button>';
    }
    if (!st.charges_enabled) {
      return '<p><span class="badge badge--warn">Compte Stripe à finaliser</span></p>' +
        '<p class="help">Stripe a besoin de quelques informations (identité, IBAN…) avant d’accepter des paiements.</p>' +
        '<button class="btn btn--primary btn--sm" type="button" data-pay-onboard>Terminer la configuration Stripe</button>';
    }
    return '<p><span class="badge badge--ok">Compte Stripe actif</span></p>' +
      '<label class="switch"><input type="checkbox" data-pay-toggle' + (st.online_payment ? ' checked' : '') + '><span class="switch__track"></span>' +
        '<span>Proposer « Payer maintenant » aux clients</span></label>' + free +
      '<a class="link-btn" href="https://dashboard.stripe.com" target="_blank" rel="noopener">Ouvrir mon tableau de bord Stripe ↗</a>';
  }

  function mountPayments(box) {
    if (!canManage()) { box.innerHTML = '<p class="help">Réservé au gérant.</p>'; return; }
    var st = null;
    var paint = function () { box.innerHTML = payBoxHTML(st); };
    T.payments.status().then(function (r) { st = r; paint(); }, function (err) {
      box.innerHTML = '<p class="help">' + esc(err.message) + '</p>';
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pay-onboard]');
      if (!b) return;
      b.disabled = true;
      b.innerHTML = '<span class="spinner"></span> Ouverture de Stripe…';
      T.payments.onboard().then(function (r) { location.href = r.url; }, function (err) {
        UI.toast(esc(err.message), 5000);
        paint();
      });
    });
    box.addEventListener('change', function (e) {
      if (!e.target.matches('[data-pay-toggle]')) return;
      var on = e.target.checked;
      e.target.disabled = true;
      T.payments.setEnabled(on).then(function () {
        st.online_payment = on;
        UI.toast(on ? 'Paiement en ligne proposé aux clients' : 'Paiement en ligne désactivé · les clients paient à table');
        paint();
      }, function (err) { UI.toast(esc(err.message), 5000); paint(); });
    });
  }

  // Retour du formulaire Stripe (kitchen.html?stripe=retour).
  function stripeReturn() {
    var q = new URLSearchParams(location.search);
    var back = q.get('stripe');
    if (!back || !LIVE || !T.payments) return;
    q.delete('stripe');
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '')); } catch (e) { /* ignore */ }
    T.payments.status().then(function (st) {
      UI.toast(st.charges_enabled
        ? 'Compte Stripe actif ✓ Activez « Payer maintenant » dans Établissement.'
        : 'Configuration Stripe incomplète : reprenez-la depuis Établissement → Paiement en ligne.', 6000);
      if (st.charges_enabled && !st.online_payment) openSettings();
    }, function (err) { UI.toast(esc(err.message), 5000); });
  }

  /* ======================================================================
     Serveur attitré de chaque table (affiché au client)
     ====================================================================== */
  function openServers(prefTable) {
    var count = Math.max(1, parseInt(T.getRestaurant().tables, 10) || 12);
    var picked = {};
    if (prefTable) picked[prefTable] = true;
    var name = prefTable ? T.getTableServer(prefTable) : '';
    var KEY = 'tapigo.v1.kitchen.serverNames';
    var known = function () {
      var list = T.read(KEY, []);
      var all = T.getTableServers();
      Object.keys(all).forEach(function (k) { if (list.indexOf(all[k]) < 0) list.push(all[k]); });
      return list.slice(0, 12);
    };
    var gridHTML = function () {
      var all = T.getTableServers();
      var html = '';
      for (var i = 1; i <= count; i++) {
        var k = String(i);
        html += '<button type="button" class="srv-table' + (picked[k] ? ' is-on' : '') + '" data-pick-table="' + k + '" aria-pressed="' + !!picked[k] + '">' +
          '<b>' + k + '</b><small>' + (all[k] ? esc(all[k]) : '—') + '</small></button>';
      }
      return html;
    };
    UI.openSheet({
      label: 'Serveurs des tables',
      head: '<p class="eyebrow">Salle</p><h2>Serveurs des tables</h2>',
      body:
        '<p class="help">Le client voit « Votre serveur : … » sur son téléphone. Choisissez un prénom, touchez les tables concernées, puis enregistrez.</p>' +
        '<label class="field"><span>Prénom du serveur</span><input id="srvName" maxlength="40" placeholder="Ex : Marco" value="' + esc(name) + '" autocomplete="off"></label>' +
        '<div class="chips" id="srvKnown"></div>' +
        '<div class="srv-grid" id="srvGrid">' + gridHTML() + '</div>' +
        '<button class="link-btn" type="button" id="srvAll">Tout sélectionner</button>',
      footer:
        '<button class="btn btn--ghost" type="button" id="srvClear">Retirer le serveur</button>' +
        '<button class="btn btn--primary" type="button" id="srvSave">Attribuer</button>',
      onMount: function (sheet) {
        var paintKnown = function () {
          $('#srvKnown', sheet).innerHTML = known().map(function (n) {
            return '<button type="button" class="chip" data-known="' + esc(n) + '">' + esc(n) + '</button>';
          }).join('');
        };
        paintKnown();
        var selected = function () { return Object.keys(picked).filter(function (k) { return picked[k]; }); };
        sheet.addEventListener('click', function (e) {
          var b;
          if ((b = e.target.closest('[data-pick-table]'))) {
            picked[b.dataset.pickTable] = !picked[b.dataset.pickTable];
            $('#srvGrid', sheet).innerHTML = gridHTML();
          } else if ((b = e.target.closest('[data-known]'))) {
            $('#srvName', sheet).value = b.dataset.known;
          } else if (e.target.closest('#srvAll')) {
            var allOn = selected().length === count;
            for (var i = 1; i <= count; i++) picked[String(i)] = !allOn;
            $('#srvGrid', sheet).innerHTML = gridHTML();
          }
        });
        var apply = function (value) {
          var tables = selected();
          if (!tables.length) return UI.toast('Touchez d’abord une ou plusieurs tables');
          if (value) {
            var list = T.read(KEY, []).filter(function (n) { return n !== value; });
            list.unshift(value);
            T.write(KEY, list.slice(0, 12));
          }
          T.setTableServers(tables, value);
          picked = {};
          $('#srvGrid', sheet).innerHTML = gridHTML();
          paintKnown();
          UI.toast(value
            ? '<strong>' + esc(value) + '</strong> · table' + (tables.length > 1 ? 's ' : ' ') + tables.join(', ')
            : 'Serveur retiré · table' + (tables.length > 1 ? 's ' : ' ') + tables.join(', '));
        };
        $('#srvSave', sheet).addEventListener('click', function () {
          var v = $('#srvName', sheet).value.trim();
          if (!v) { $('#srvName', sheet).focus(); return UI.toast('Indiquez le prénom du serveur'); }
          apply(v);
        });
        $('#srvClear', sheet).addEventListener('click', function () { apply(''); });
      }
    });
  }

  /* ======================================================================
     Impression du ticket (imprimante thermique 80 mm ou classique)
     ====================================================================== */
  function printTicket(id) {
    var o = T.getOrder(id);
    if (!o) return;
    var r = T.getRestaurant();
    $('#printArea').innerHTML = '<div class="print-ticket">' +
      '<p class="pt-center"><strong>' + esc(r.name) + '</strong></p>' +
      '<p class="pt-big">TABLE ' + esc(o.table) + '</p>' +
      '<p class="pt-center">Commande n° ' + o.number + ' · ' + T.clock(o.createdAt) + '</p><hr>' +
      o.lines.map(function (l) {
        return '<div class="pt-line"><strong>' + l.qty + ' × ' + esc(l.name) + '</strong>' +
          l.options.map(function (op) { return '<div>  ' + esc(op.group) + ' : ' + esc(op.values.join(', ')) + '</div>'; }).join('') +
          (l.note ? '<div>  ⚠ ' + esc(l.note) + '</div>' : '') + '</div>';
      }).join('') +
      (o.note ? '<hr><p><strong>Note :</strong> ' + esc(o.note) + '</p>' : '') +
      '<hr><p class="pt-total"><span>Total</span><span>' + fmt(o.total) + '</span></p>' +
      (o.tip ? '<p class="pt-total"><span>Pourboire</span><span>' + fmt(o.tip) + '</span></p>' : '') +
      (T.getTableServer(o.table) ? '<p class="pt-center">Serveur : ' + esc(T.getTableServer(o.table)) + '</p>' : '') +
      '<p class="pt-center">' + payLabel(o) + '</p></div>';
    window.print();
  }

  /* ======================================================================
     Appels des tables, pause, fiabilité de la tablette
     ====================================================================== */
  function announceService(q) {
    if (state.sound) UI.chime();
    UI.vibrate([80, 60, 80]);
    UI.toast((q.kind === 'addition' ? '🧾' : '🙋') + ' <strong>Table ' + esc(q.table_label) + '</strong> ' +
      (q.kind === 'addition' ? 'demande l’addition' : 'appelle un serveur'), 6000);
  }

  function canManage() {
    if (!LIVE) return true;
    var cur = T.currentRestaurant();
    return cur && cur.role !== 'equipe';
  }

  function renderPause() {
    var b = $('#pauseBtn');
    var paused = !!T.getRestaurant().ordersPaused;
    b.hidden = !canManage();
    b.setAttribute('aria-pressed', String(paused));
    b.classList.toggle('is-paused', paused);
    b.textContent = paused ? '⏸ Commandes en pause' : 'Pause';
    b.title = paused ? 'Reprendre les commandes en ligne' : 'Suspendre les commandes en ligne (coup de feu, fermeture)';
  }

  // Rappel sonore tant qu'une commande ou un appel n'a pas été traité.
  // Rappel sonore toutes les 30 s pour ce qui attend encore (15 min au plus),
  // avec la raison affichée : une commande pas encore ouverte, un appel de table.
  var REMIND_FOR = 15 * 60000;
  function remind() {
    if (!state.sound || document.hidden) return;
    var unseen = T.getOrders().filter(function (o) {
      return !o.seen && o.status === 'nouvelle' && Date.now() - o.createdAt < REMIND_FOR;
    });
    var calls = T.getServiceRequests().filter(function (q) { return Date.now() - Date.parse(q.created_at) < REMIND_FOR; });
    if (!unseen.length && !calls.length) return;
    UI.chime();
    var parts = [];
    if (unseen.length) parts.push(unseen.length + ' commande' + (unseen.length > 1 ? 's' : '') + ' pas encore ouverte' + (unseen.length > 1 ? 's' : '') +
      ' (table ' + unseen.map(function (o) { return esc(o.table); }).join(', ') + ')');
    if (calls.length) parts.push(calls.length + ' appel' + (calls.length > 1 ? 's' : '') + ' de table en attente');
    UI.toast('⏰ <strong>Rappel</strong> · ' + parts.join(' · ') + '<br><small>Touchez la commande ou « C’est fait » pour arrêter le rappel.</small>', 5000);
  }

  // Empêche la tablette de se mettre en veille pendant le service.
  var wakeLock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || document.hidden) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () { /* refusé */ });
  }

  function renderOnline() { $('#offlineBanner').hidden = navigator.onLine !== false; }

  /* ======================================================================
     Catégories de la carte
     ====================================================================== */
  function openCategories() {
    var menu = T.getMenu();
    if (!menu.categories.length) menu.categories = window.TAPIGO_DEMO.categories.slice();
    var cats = menu.categories.map(function (c) { return { id: c.id, label: c.label }; });
    var count = function (id) { return menu.items.filter(function (i) { return i.category === id; }).length; };

    var rowsHTML = function () {
      return cats.map(function (c, i) {
        return '<div class="cat-row" data-i="' + i + '">' +
          '<input class="input" value="' + esc(c.label) + '" data-label aria-label="Nom de la catégorie" maxlength="30">' +
          '<span class="help">' + count(c.id) + ' plat' + (count(c.id) > 1 ? 's' : '') + '</span>' +
          '<button class="icon-btn" type="button" data-move="-1" aria-label="Monter"' + (i ? '' : ' disabled') + '>↑</button>' +
          '<button class="icon-btn" type="button" data-move="1" aria-label="Descendre"' + (i < cats.length - 1 ? '' : ' disabled') + '>↓</button>' +
          '<button class="icon-btn" type="button" data-del aria-label="Supprimer">' + I.trash + '</button>' +
        '</div>';
      }).join('');
    };

    UI.openSheet({
      label: 'Catégories',
      head: '<p class="eyebrow">Carte</p><h2>Catégories</h2>',
      body:
        '<p class="product-desc">L’ordre ici est celui de la carte côté client (ex. Apéritifs, Pizzas, Vins…).</p>' +
        '<div id="catRows" style="display:grid;gap:8px"></div>' +
        '<form id="catAdd" style="display:flex;gap:8px"><input class="input" name="label" placeholder="Nouvelle catégorie" maxlength="30">' +
        '<button class="btn btn--soft" type="submit">Ajouter</button></form>',
      footer: '<button class="btn btn--primary" type="button" id="catSave">Enregistrer</button>',
      onMount: function (sheet) {
        var box = $('#catRows', sheet);
        var paint = function () { box.innerHTML = rowsHTML(); };
        var syncLabels = function () {
          box.querySelectorAll('.cat-row').forEach(function (row) { cats[+row.dataset.i].label = row.querySelector('[data-label]').value; });
        };
        paint();
        box.addEventListener('click', function (e) {
          var row = e.target.closest('.cat-row');
          if (!row) return;
          syncLabels();
          var i = +row.dataset.i;
          var mv = e.target.closest('[data-move]');
          if (mv) {
            var j = i + Number(mv.dataset.move);
            var tmp = cats[i]; cats[i] = cats[j]; cats[j] = tmp;
            return paint();
          }
          if (e.target.closest('[data-del]')) {
            if (count(cats[i].id)) return UI.toast('Déplacez ou supprimez d’abord les plats de « ' + esc(cats[i].label) + ' »', 4000);
            if (cats.length === 1) return UI.toast('La carte doit garder au moins une catégorie');
            cats.splice(i, 1);
            paint();
          }
        });
        $('#catAdd', sheet).addEventListener('submit', function (e) {
          e.preventDefault();
          syncLabels();
          var label = e.target.elements.label.value.trim();
          if (!label) return;
          var base = T._slug(label), id = base, n = 2;
          while (cats.some(function (c) { return c.id === id; })) id = base + '-' + n++;
          cats.push({ id: id, label: label });
          e.target.reset();
          paint();
        });
        $('#catSave', sheet).addEventListener('click', function () {
          syncLabels();
          if (cats.some(function (c) { return !c.label.trim(); })) return UI.toast('Chaque catégorie doit avoir un nom');
          menu.categories = cats.map(function (c) { return { id: c.id, label: c.label.trim() }; });
          T.replaceMenu(menu);
          UI.closeSheet();
          UI.toast('Catégories enregistrées');
        });
      }
    });
  }

  /* ======================================================================
     Prise de commande par un serveur
     ====================================================================== */
  function openOrderPad(prefTable) {
    var menu = T.getMenu();
    var info = T.getRestaurant();
    var nTables = Math.max(1, parseInt(info.tables, 10) || 12);
    var pad = { table: String(prefTable || ''), lines: [], note: '', cat: 'all', q: '', open: null };
    var orderable = function (i) { return i.available !== false && T.getStock(i.id) !== 0; };
    var inPad = function (id, except) {
      return pad.lines.reduce(function (sum, l) { return sum + (l.itemId === id && l !== except ? l.qty : 0); }, 0);
    };
    var room = function (id, except) {
      var st = T.getStock(id);
      return st == null ? 99 : Math.max(0, st - inPad(id, except));
    };
    var built = function (l) { return T.buildLine(l.itemId, l.qty, l.selections, l.note); };
    var total = function () { return pad.lines.reduce(function (sum, l) { return sum + built(l).unitPrice * l.qty; }, 0); };

    function addLine(id, sel) {
      if (room(id) <= 0) return UI.toast('Plus aucun disponible');
      var key = id + '#' + JSON.stringify(sel || {});
      var line = pad.lines.filter(function (l) { return l.key === key && !l.note; })[0];
      if (line) line.qty++;
      else pad.lines.push({ key: key, itemId: id, qty: 1, selections: sel || {}, note: '' });
      UI.vibrate(10);
    }

    function itemHTML(i) {
      var st = T.getStock(i.id), n = inPad(i.id);
      var html = '<div class="pad-item' + (pad.open === i.id ? ' is-open' : '') + '">' +
        '<button class="pad-item__main" type="button" data-pad-item="' + esc(i.id) + '">' +
          '<span class="pad-item__name">' + esc(i.name) +
            ((i.options || []).length ? ' <small>options</small>' : '') + '</span>' +
          (st != null ? '<span class="badge ' + (st <= 5 ? 'badge--warn' : '') + '">' + st + ' rest.</span>' : '') +
          '<span class="pad-item__price">' + fmt(T.itemPrice(i)) + '</span>' +
          (n ? '<span class="pad-item__qty">' + n + '</span>' : '<span class="pad-item__plus" aria-hidden="true">+</span>') +
        '</button>';
      if (pad.open === i.id) {
        html += '<div class="pad-opts" data-pad-opts="' + esc(i.id) + '">' + i.options.map(function (g) {
          var multi = g.type === 'multi';
          return '<fieldset class="opt-group" data-group="' + esc(g.id) + '"><legend>' + esc(g.name) +
            '<small>' + (g.required ? 'Obligatoire' : 'Facultatif') + '</small></legend><div class="check-row check-row--sm">' +
            g.choices.map(function (c) {
              return '<label><input type="' + (multi ? 'checkbox' : 'radio') + '" name="po_' + esc(g.id) + '" value="' + esc(c.label) + '"> ' +
                esc(c.label) + (Number(c.price) ? ' (+' + fmt(c.price) + ')' : '') + '</label>';
            }).join('') + '</div></fieldset>';
        }).join('') +
        '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn--ghost btn--sm" type="button" data-pad-cancel>Annuler</button>' +
        '<button class="btn btn--primary btn--sm" type="button" data-pad-add="' + esc(i.id) + '">Ajouter</button></div></div>';
      }
      return html + '</div>';
    }

    function paint(sheet) {
      var box = $('#pad', sheet);
      var focusId = document.activeElement && document.activeElement.id;
      var q = norm(pad.q);
      var items = menu.items.filter(function (i) {
        return orderable(i) && (pad.cat === 'all' || i.category === pad.cat) && (!q || norm(i.name).indexOf(q) >= 0);
      });

      box.innerHTML =
        '<div class="field"><span>Table</span>' +
          (nTables <= 40
            ? '<div class="pad-tables">' + Array.apply(null, Array(nTables)).map(function (_, k) {
                var n = String(k + 1);
                return '<button type="button" data-pad-table="' + n + '" aria-pressed="' + (pad.table === n) + '">' + n + '</button>';
              }).join('') + '</div>'
            : '<input class="input" id="padTable" inputmode="numeric" maxlength="4" value="' + esc(pad.table) + '" placeholder="N° de table">') +
        '</div>' +
        '<label class="search">' + I.search + '<input id="padSearch" type="search" placeholder="Rechercher un plat…" value="' + esc(pad.q) + '" aria-label="Rechercher un plat"></label>' +
        '<div class="chips">' + [{ id: 'all', label: 'Tout' }].concat(menu.categories).map(function (c) {
          return '<button class="chip" type="button" data-pad-cat="' + esc(c.id) + '" aria-pressed="' + (pad.cat === c.id) + '">' + esc(c.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="pad-items">' + (items.length ? items.map(itemHTML).join('') : '<p class="help">Aucun plat disponible.</p>') + '</div>' +
        '<div class="pad-ticket"><p class="eyebrow">Commande' + (pad.table ? ' · Table ' + esc(pad.table) : '') + '</p>' +
          (pad.lines.length ? pad.lines.map(function (l, idx) {
            var b = built(l);
            return '<div class="pad-line">' +
              '<div class="stepper stepper--sm"><button type="button" data-pad-qty="' + idx + '" data-d="-1" aria-label="Retirer un">−</button><output>' + l.qty + '</output>' +
                '<button type="button" data-pad-qty="' + idx + '" data-d="1" aria-label="Ajouter un">+</button></div>' +
              '<div class="pad-line__txt"><strong>' + esc(b.name) + '</strong>' +
                (b.options.length ? '<small>' + esc(b.options.map(function (o) { return o.values.join(', '); }).join(' · ')) + '</small>' : '') +
                '<input class="pad-line__note" data-pad-note="' + idx + '" value="' + esc(l.note) + '" placeholder="Note (sans oignon…)" maxlength="140"></div>' +
              '<span class="pad-line__price">' + fmt(b.unitPrice * l.qty) + '</span></div>';
          }).join('') : '<p class="help">Touchez un plat pour l’ajouter.</p>') +
          '<label class="field"><span>Note pour toute la commande</span><input class="input" id="padNote" value="' + esc(pad.note) + '" maxlength="200" placeholder="Ex : servir les entrées ensemble"></label>' +
        '</div>';

      var n = pad.lines.reduce(function (sum, l) { return sum + l.qty; }, 0);
      $('#padSend', sheet).disabled = !n || !pad.table;
      $('#padSend', sheet).textContent = !pad.table ? 'Choisissez la table' : n ? 'Envoyer en cuisine · ' + fmt(total()) : 'Commande vide';
      if (focusId && $('#' + focusId, sheet)) {
        var el = $('#' + focusId, sheet);
        el.focus();
        if (el.setSelectionRange && el.type !== 'number') el.setSelectionRange(el.value.length, el.value.length);
      }
    }

    UI.openSheet({
      label: 'Prendre une commande',
      head: '<p class="eyebrow">Prise de commande en salle</p><h2>Nouvelle commande</h2>',
      body: '<div id="pad" style="display:grid;gap:14px"></div>',
      footer: '<button class="btn btn--primary" type="button" id="padSend">Envoyer en cuisine</button>',
      onMount: function (sheet) {
        paint(sheet);
        sheet.addEventListener('click', function (e) {
          var t;
          if ((t = e.target.closest('[data-pad-table]'))) { pad.table = t.dataset.padTable; return paint(sheet); }
          if ((t = e.target.closest('[data-pad-cat]'))) { pad.cat = t.dataset.padCat; pad.open = null; return paint(sheet); }
          if (e.target.closest('[data-pad-cancel]')) { pad.open = null; return paint(sheet); }
          if ((t = e.target.closest('[data-pad-item]'))) {
            var item = T.getItem(t.dataset.padItem);
            if ((item.options || []).length) { pad.open = pad.open === item.id ? null : item.id; return paint(sheet); }
            addLine(item.id, {});
            return paint(sheet);
          }
          if ((t = e.target.closest('[data-pad-add]'))) {
            var it = T.getItem(t.dataset.padAdd), panel = t.closest('[data-pad-opts]'), sel = {}, missing = null;
            it.options.forEach(function (g) {
              var picked = [].slice.call(panel.querySelectorAll('[name="po_' + g.id + '"]:checked')).map(function (x) { return x.value; });
              if (picked.length) sel[g.id] = picked;
              else if (g.required && !missing) missing = g.name;
            });
            if (missing) return UI.toast('Choisissez : ' + esc(missing));
            addLine(it.id, sel);
            pad.open = null;
            return paint(sheet);
          }
          if ((t = e.target.closest('[data-pad-qty]'))) {
            var line = pad.lines[+t.dataset.padQty];
            if (Number(t.dataset.d) > 0 && room(line.itemId, line) <= line.qty) return UI.toast('Plus aucun disponible');
            line.qty += Number(t.dataset.d);
            if (line.qty <= 0) pad.lines.splice(+t.dataset.padQty, 1);
            return paint(sheet);
          }
          if (e.target.closest('#padSend')) return send(sheet);
        });
        sheet.addEventListener('input', function (e) {
          if (e.target.id === 'padSearch') { pad.q = e.target.value; pad.open = null; paint(sheet); }
          if (e.target.id === 'padTable') { pad.table = e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 4); paint(sheet); }
        });
        sheet.addEventListener('change', function (e) {
          if (e.target.id === 'padNote') pad.note = e.target.value.trim();
          if (e.target.matches('[data-pad-note]')) pad.lines[+e.target.dataset.padNote].note = e.target.value.trim();
        });
      }
    });

    function send(sheet) {
      var btn = $('#padSend', sheet);
      var noteEl = $('#padNote', sheet);
      if (noteEl) pad.note = noteEl.value.trim();
      sheet.querySelectorAll('[data-pad-note]').forEach(function (el) { pad.lines[+el.dataset.padNote].note = el.value.trim(); });
      if (/^\d+$/.test(pad.table) && (+pad.table < 1 || +pad.table > nTables)) return UI.toast('La table ' + esc(pad.table) + ' n’existe pas (1 à ' + nTables + ')');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Envoi…';
      suppressAnnounce = true;
      Promise.resolve().then(function () {
        return T.createOrder({
          table: pad.table,
          note: pad.note,
          source: 'serveur',
          payment: { method: 'onsite', status: 'pending' },
          lines: pad.lines.map(built)
        });
      }).then(function (o) {
        suppressAnnounce = false;
        UI.closeSheet();
        UI.toast('✓ Commande n° <strong>' + o.number + '</strong> envoyée · table ' + esc(o.table));
        if (state.view === 'orders') renderOrders();
      }).catch(function (err) {
        suppressAnnounce = false;
        btn.disabled = false;
        btn.textContent = 'Envoyer en cuisine · ' + fmt(total());
        UI.toast(esc(err.message), 5000);
      });
    }
  }

  /* ======================================================================
     Stocks — gérés par toute l'équipe (gérant ou non)
     ====================================================================== */
  var stockQ = '';
  var LOW = 5;

  function stockState(item) {
    var st = T.getStock(item.id);
    if (item.available === false) return 'off';
    if (st === 0) return 'out';
    if (st != null && st <= LOW) return 'low';
    return 'ok';
  }

  function updateStockBadge() {
    var n = T.getMenu().items.filter(function (i) { var s = stockState(i); return s === 'out' || s === 'low'; }).length;
    var c = $('#stockCount');
    c.hidden = !n;
    c.textContent = n;
  }

  function stockRowHTML(i) {
    var st = T.getStock(i.id), state = stockState(i), on = i.available !== false;
    var label = { off: 'En rupture', out: 'Épuisé', low: 'Stock bas', ok: st == null ? 'Illimité' : 'En stock' }[state];
    var badge = { off: 'badge--danger', out: 'badge--danger', low: 'badge--warn', ok: st == null ? '' : 'badge--ok' }[state];
    return '<div class="stock-row stock-row--' + state + '" data-stock="' + esc(i.id) + '">' +
      UI.media(i, 'editor-row__thumb') +
      '<div class="editor-row__name"><strong>' + esc(i.name) + '</strong><span class="badge ' + badge + '">' + label + '</span></div>' +
      '<div class="stock-cell"><span class="stock-cell__label">Stock réel</span>' +
      '<div class="qty-ctrl" role="group" aria-label="Quantité restante de ' + esc(i.name) + '">' +
        '<button class="icon-btn" type="button" data-qty="-1" aria-label="Retirer un"' + (st ? '' : ' disabled') + '>−</button>' +
        '<input type="number" min="0" max="100000" inputmode="numeric" data-qty-input value="' + (st == null ? '' : st) + '" placeholder="∞" aria-label="Quantité restante">' +
        '<button class="icon-btn" type="button" data-qty="1" aria-label="Ajouter un">+</button>' +
      '</div></div>' +
      adviceHTML(i, st) +
      '<div class="stock-row__quick">' +
        '<button class="btn btn--ghost btn--sm" type="button" data-qty-set="0">Épuisé</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-qty-set="">Illimité</button>' +
      '</div>' +
      '<label class="switch"><input type="checkbox" data-stock-avail' + (on ? ' checked' : '') + '><span class="switch__track"></span><span>' + (on ? 'En vente' : 'Rupture') + '</span></label>' +
    '</div>';
  }

  /* ---------------- Prévision IA du jour ---------------- */
  var fc = { data: null, loaded: false, loading: false, running: false, error: '' };

  function loadForecast() {
    if (!T.forecast || fc.loading) return;
    fc.loading = true;
    T.forecast.get().then(function (f) { fc.data = f; }, function (err) { fc.error = err.message; })
      .then(function () { fc.loaded = true; fc.loading = false; if (state.view === 'stock') renderStock(); });
  }

  function runForecast(context) {
    fc.running = true; fc.error = '';
    renderStock();
    T.forecast.run(context).then(function (f) {
      fc.data = f;
      UI.toast(f.source === 'ia' ? 'Prévision IA du jour prête' : 'Prévision du jour prête');
    }, function (err) { fc.error = err.message; UI.toast(esc(err.message), 5000); })
      .then(function () { fc.running = false; renderStock(); });
  }

  // Stock conseillé du jour par produit : { itemId: { quantity, reason } }. Il ne modifie jamais le stock réel.
  function advice() {
    var out = {};
    if (fc.data) (fc.data.items || []).forEach(function (s) { out[s.itemId] = s; });
    return out;
  }

  // Colonne « Conseillé » d'une ligne de stock, à côté du stock réel.
  function adviceHTML(item, st) {
    if (!T.forecast) return '';
    var a = fc.data && advice()[item.id];
    var note, cls = '';
    if (!fc.data) note = 'pas encore calculé';
    else if (!a) note = 'rien de prévu';
    else if (st == null) note = 'stock illimité';
    else if (st < a.quantity) { note = 'manque ' + (a.quantity - st); cls = ' is-short'; }
    else { note = 'suffisant'; cls = ' is-ok'; }
    return '<div class="stock-cell stock-cell--advice' + cls + '"' + (a && a.reason ? ' title="' + esc(a.reason) + '"' : '') + '>' +
      '<span class="stock-cell__label">Conseillé</span><b>' + (a ? a.quantity : '—') + '</b><small>' + note + '</small></div>';
  }

  function forecastHTML() {
    if (!T.forecast) return '';
    var head = '<div class="forecast__head"><div><p class="eyebrow">' + I.bolt.replace('<svg ', '<svg width="14" height="14" ') + ' Prévision IA · aujourd’hui</p>' +
      '<h2>Stock conseillé pour la journée</h2></div>';
    var ctxField = '<div class="forecast__ctx"><input id="fcContext" maxlength="300" placeholder="Contexte du jour (facultatif) : météo, match, groupe de 20 réservé…" value="' +
      esc(fc.data && fc.data.context || '') + '" aria-label="Contexte du jour">' +
      '<button class="btn btn--ghost btn--sm" type="button" data-fc-run' + (fc.running ? ' disabled' : '') + '>' +
      (fc.running ? '<span class="spinner"></span> Analyse en cours…' : fc.data ? 'Recalculer' : 'Calculer la prévision') + '</button></div>';

    if (!fc.loaded) return '<section class="forecast">' + head + '</div><p class="help"><span class="spinner"></span> Chargement…</p></section>';
    if (!fc.data) {
      return '<section class="forecast">' + head + '</div>' +
        '<p class="forecast__summary">Chaque matin, l’IA analyse les ventes des dernières semaines (même jour, tendance) et propose la quantité à prévoir pour chaque produit. ' +
        'Rien n’est modifié sans votre validation.</p>' +
        (fc.error ? '<p class="help" style="color:var(--danger)">' + esc(fc.error) + '</p>' : '') + ctxField + '</section>';
    }
    var a = advice(), short = 0;
    Object.keys(a).forEach(function (id) { var st = T.getStock(id); if (T.getItem(id) && st != null && st < a[id].quantity) short++; });
    var when = fc.data.created_at ? T.clock(Date.parse(fc.data.created_at)) : '';
    return '<section class="forecast">' + head + '</div>' +
      '<p class="forecast__summary">' + esc(fc.data.summary || '') + '</p>' +
      ((fc.data.alerts || []).length ? '<ul class="forecast__alerts">' + fc.data.alerts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      '<p class="forecast__summary"><strong>' + (short ? short + ' produit' + (short > 1 ? 's' : '') + ' en dessous du stock conseillé' : 'Stock réel suffisant pour la journée') + '</strong> · ' +
        'voir la colonne « Conseillé » dans la liste ci-dessous. Votre stock réel n’est jamais modifié par la prévision.</p>' +
      ctxField +
      '<p class="help">' + (fc.data.source === 'ia' ? 'Analyse IA (Claude)' : 'Base statistique') + (when ? ' · calculée à ' + when : '') + '</p>' +
    '</section>';
  }

  /* ---------------- Bon de livraison lu par l'IA ---------------- */
  // sc.result.lines : [{ label, quantity_text, item_id, quantity, explanation, confidence, on }]
  var sc = { busy: false, applying: false, error: '', result: null, dated: null, dating: false };
  var SCAN_MAX = 4;

  // Photo réduite (1600 px, JPEG) : envoi rapide, même en 4G. PDF envoyé tel quel.
  function fileToPage(file) {
    if (file.type === 'application/pdf') {
      if (file.size > 6 * 1024 * 1024) return Promise.reject(new Error('PDF trop lourd (6 Mo au maximum).'));
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve({ media_type: 'application/pdf', data: String(r.result).split(',')[1] }); };
        r.onerror = function () { reject(new Error('Fichier illisible')); };
        r.readAsDataURL(file);
      });
    }
    if (!/^image\//.test(file.type)) return Promise.reject(new Error('Envoyez une photo ou un PDF.'));
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Photo illisible (format non pris en charge par ce navigateur).')); };
      img.src = url;
    });
  }

  function runScan(files) {
    files = Array.prototype.slice.call(files || [], 0, SCAN_MAX);
    if (!files.length) return;
    sc.busy = true; sc.error = ''; sc.result = null;
    renderStock();
    Promise.all(files.map(fileToPage)).then(T.scan.read).then(function (r) {
      r.lines.forEach(function (l) { l.on = !!(l.item_id && l.quantity); });
      sc.result = r;
    }, function (err) { sc.error = err.message; })
      .then(function () { sc.busy = false; renderStock(); });
  }

  function scanTodo() {
    if (!sc.result) return [];
    return sc.result.lines.filter(function (l) { return l.on && l.item_id && l.quantity > 0 && T.getItem(l.item_id); });
  }

  function applyScan() {
    var todo = scanTodo();
    if (!todo.length || sc.applying) return;
    sc.applying = true;
    renderStock();
    var dated = sc.result.lines.filter(function (l) { return l.expires_on; });
    var supplierName = sc.result.supplier;
    // Prix d'achat des lignes chiffrées : mis à jour dans les fiches techniques (onglet Marges).
    var priced = sc.result.lines.filter(function (l) { return l.total_ht != null && l.amount > 0 && l.amount_unit; })
      .map(function (l) { return { name: l.label, total: l.total_ht, amount: l.amount, unit: l.amount_unit }; });
    // Coût d'achat d'une portion : total HT de la ligne ÷ portions livrées.
    T.scan.apply(sc.result.scan_id, todo.map(function (l) {
      return { itemId: l.item_id, quantity: l.quantity, unitCost: l.total_ht != null && l.quantity > 0 ? Math.round(l.total_ht / l.quantity * 10000) / 10000 : null };
    })).then(function (n) {
      UI.toast('Livraison ajoutée au stock · ' + n + ' produit' + (n > 1 ? 's' : ''));
      if (priced.length && T.margins) T.margins.recordPrices(priced).catch(function () { /* facultatif */ });
      // Fournisseur du bon : enregistré et rattaché aux produits livrés (commandes fournisseurs).
      if (window.TapigoSuppliers) window.TapigoSuppliers.learn(supplierName, todo.map(function (l) { return l.item_id; }));
      sc.result = null;
      // Dates limites imprimées sur le bon : proposées pour l'onglet Dates.
      sc.dated = T.expiry && dated.length ? datedFromScan(dated) : null;
    }, function (err) { UI.toast(esc(err.message), 5000); })
      .then(function () { sc.applying = false; renderStock(); });
  }

  // Lignes du bon avec une date limite -> propositions pour l'onglet Dates.
  function datedFromScan(lines) {
    var zone = T.expiry.station();
    return lines.map(function (l) {
      var item = l.item_id && T.getItem(l.item_id);
      var station = zone !== 'all' ? zone : (l.station || (item && item.station === 'bar' ? 'bar' : 'cuisine'));
      return { on: true, label: item ? item.name : l.label, itemId: l.item_id || null, kind: l.date_kind || 'dlc', expiresOn: l.expires_on,
        quantity: l.quantity_text || '', note: l.lot ? 'Lot ' + l.lot : '', station: station,
        portions: item && l.quantity > 0 ? l.quantity : null, // décomptées ensuite par les commandes
        amount: item ? null : l.amount || (parseQty(l.quantity_text) || {}).amount || null,
        unit: item ? null : l.amount_unit || (parseQty(l.quantity_text) || {}).unit || null,
        unitCost: l.total_ht == null ? null : item ? (l.quantity > 0 ? l.total_ht / l.quantity : null)
          : (l.amount > 0 ? l.total_ht / l.amount : null) };
    });
  }

  function datedHTML() {
    var zone = T.expiry.station(), n = sc.dated.filter(function (d) { return d.on; }).length;
    return '<p class="forecast__summary"><strong>Dates limites relevées sur le bon</strong> · ajoutez-les à l’onglet Dates pour être prévenu avant qu’elles ne dépassent.</p>' +
      '<div class="forecast__list">' + sc.dated.map(function (d, i) {
        return '<div class="scan-row' + (d.on ? '' : ' is-off') + '" data-dated="' + i + '">' +
          '<label class="scan-row__check"><input type="checkbox" data-dated-on' + (d.on ? ' checked' : '') + ' aria-label="Ajouter aux dates"></label>' +
          '<div class="fc-row__name"><strong>' + esc(d.label) + '</strong><small>' + (d.kind === 'ddm' ? 'DDM / DLUO' : 'DLC') + ' · ' +
            esc(new Date(d.expiresOn + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })) +
            (d.portions ? ' · ' + d.portions + ' portions, décomptées par les commandes' : '') + (d.note ? ' · ' + esc(d.note) : '') + '</small></div>' +
          (zone === 'all'
            ? '<select data-dated-station aria-label="Poste"><option value="cuisine"' + (d.station === 'cuisine' ? ' selected' : '') + '>Cuisine</option><option value="bar"' + (d.station === 'bar' ? ' selected' : '') + '>Bar</option></select>'
            : '<span class="badge">' + (zone === 'bar' ? 'Bar' : 'Cuisine') + '</span>') +
          '<span></span></div>';
      }).join('') + '</div>' +
      '<div class="forecast__ctx"><button class="btn btn--primary btn--sm" type="button" data-dated-add' + (n && !sc.dating ? '' : ' disabled') + '>' +
        (sc.dating ? '<span class="spinner"></span> Ajout…' : 'Ajouter aux Dates (' + n + ')') + '</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-dated-skip>Plus tard</button></div>';
  }

  function addDated() {
    var todo = sc.dated.filter(function (d) { return d.on; });
    if (!todo.length || sc.dating) return;
    sc.dating = true;
    renderStock();
    // Une à une : la base vérifie chaque ligne (poste du compte, date plausible).
    todo.reduce(function (p, d) { return p.then(function () { return T.expiry.add(d); }); }, Promise.resolve()).then(function () {
      UI.toast(todo.length + ' date' + (todo.length > 1 ? 's' : '') + ' ajoutée' + (todo.length > 1 ? 's' : '') + ' à l’onglet Dates');
      sc.dated = null;
    }, function (err) { UI.toast(esc(err.message), 5000); })
      .then(function () { sc.dating = false; renderStock(); updateDatesBadge(); });
  }

  function scanHTML() {
    if (!T.scan) return '';
    var head = '<div class="forecast__head"><div><p class="eyebrow">' + I.camera.replace('<svg ', '<svg width="14" height="14" ') + ' Bon de livraison</p>' +
      '<h2>Ajouter une livraison au stock</h2></div>' +
      '<label class="btn btn--' + (sc.result ? 'ghost' : 'primary') + ' btn--sm' + (sc.busy ? ' is-disabled' : '') + '">' +
        (sc.busy ? '<span class="spinner"></span> Lecture du bon…' : I.camera.replace('<svg ', '<svg width="16" height="16" ') + (sc.result ? ' Autre bon' : ' Scanner un bon')) +
        '<input type="file" accept="image/*,application/pdf" multiple data-scan-file hidden' + (sc.busy ? ' disabled' : '') + '></label></div>';

    if (!sc.result && sc.dated) return '<section class="forecast scan">' + head + datedHTML() + '</section>';
    if (!sc.result) {
      return '<section class="forecast scan">' + head +
        '<p class="forecast__summary">Prenez en photo le bon ou la facture du fournisseur (jusqu’à ' + SCAN_MAX + ' pages). L’IA retrouve les produits de la carte et calcule les portions à ajouter. ' +
        'Rien n’est ajouté sans votre validation.</p>' +
        (sc.error ? '<p class="help" style="color:var(--danger)">' + esc(sc.error) + '</p>' : '') + '</section>';
    }

    var r = sc.result, items = T.getMenu().items.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'fr'); });
    var todo = scanTodo();
    var meta = [r.supplier, r.reference ? 'n° ' + r.reference : '', r.document_date ? r.document_date.split('-').reverse().join('/') : ''].filter(Boolean).join(' · ');
    return '<section class="forecast scan">' + head +
      (meta ? '<p class="forecast__summary"><strong>' + esc(meta) + '</strong></p>' : '') +
      (r.warning ? '<ul class="forecast__alerts"><li>' + esc(r.warning) + '</li></ul>' : '') +
      '<div class="forecast__list">' + r.lines.map(function (l, i) {
        var cur = l.item_id ? T.getStock(l.item_id) : null;
        return '<div class="scan-row' + (l.on ? '' : ' is-off') + '" data-scan-line="' + i + '">' +
          '<label class="scan-row__check"><input type="checkbox" data-scan-on' + (l.on ? ' checked' : '') + ' aria-label="Ajouter cette ligne"></label>' +
          '<div class="fc-row__name"><strong>' + esc(l.label) + '</strong><small>' + esc(l.quantity_text) + (l.explanation ? ' · ' + esc(l.explanation) : '') +
            (l.expires_on ? ' · ' + (l.date_kind === 'ddm' ? 'DDM' : 'DLC') + ' ' + esc(l.expires_on.split('-').reverse().join('/')) : '') +
            (l.total_ht != null ? ' · ' + fmt(l.total_ht) + ' HT' : '') + '</small>' +
            (l.confidence === 'low' ? '<span class="badge badge--warn">À vérifier</span>' : '') + '</div>' +
          '<select data-scan-item aria-label="Produit de la carte"><option value="">Pas un produit de la carte</option>' +
            items.map(function (it) { return '<option value="' + esc(it.id) + '"' + (it.id === l.item_id ? ' selected' : '') + '>' + esc(it.name) + '</option>'; }).join('') +
          '</select>' +
          '<div class="scan-row__qty"><span>+</span><input type="number" min="1" max="100000" inputmode="numeric" data-scan-qty value="' + (l.quantity || '') + '" placeholder="0" aria-label="Portions à ajouter">' +
            '<small>' + (l.item_id ? (cur == null ? 'illimité → suivi' : 'stock ' + cur + ' → ' + (cur + (l.quantity || 0))) : '') + '</small></div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="forecast__ctx"><button class="btn btn--primary btn--sm" type="button" data-scan-apply' + (todo.length && !sc.applying ? '' : ' disabled') + '>' +
        (sc.applying ? '<span class="spinner"></span> Ajout…' : 'Ajouter au stock (' + todo.length + ')') + '</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-scan-cancel>Annuler</button></div>' +
      '<p class="help">Les quantités s’ajoutent au stock restant. Un produit « illimité » commence à être suivi avec la quantité livrée.</p>' +
    '</section>';
  }

  function renderStock() {
    if (!fc.loaded) loadForecast();
    var menu = T.getMenu();
    var q = norm(stockQ);
    var items = menu.items.filter(function (i) { return !q || norm(i.name).indexOf(q) >= 0; });
    var count = function (k) { return menu.items.filter(function (i) { return stockState(i) === k; }).length; };
    var adv = advice();
    var alerts = menu.items.filter(function (i) {
      var s = stockState(i), st = T.getStock(i.id);
      return s === 'out' || s === 'low' || s === 'off' || (adv[i.id] && st != null && st < adv[i.id].quantity);
    });

    var html = '<div class="editor">' +
      '<div class="stat-tiles">' +
        '<div class="stat-tile"><span>Épuisés ou en rupture</span><b>' + (count('out') + count('off')) + '</b><small>invisibles côté client</small></div>' +
        '<div class="stat-tile"><span>Stock bas</span><b>' + count('low') + '</b><small>' + LOW + ' restants ou moins</small></div>' +
        '<div class="stat-tile"><span>Suivis en quantité</span><b>' + Object.keys(T.getStocks()).length + '</b><small>les autres sont illimités</small></div>' +
      '</div>' +
      forecastHTML() +
      (T.suppliers && window.TapigoSuppliers ? '<div id="supplierBlock"></div>' : '') +
      scanHTML() +
      '<p class="help">Indiquez combien de portions il reste : chaque commande les décompte automatiquement et, à 0, le plat disparaît de la carte client. ' +
        'Laissez vide pour un stock illimité. Toute l’équipe peut gérer les stocks ; les prix et la carte restent réservés au gérant.</p>' +
      '<label class="search">' + I.search + '<input id="stockSearch" type="search" placeholder="Rechercher un produit…" value="' + esc(stockQ) + '" aria-label="Rechercher un produit"></label>' +
      (alerts.length && !q ? '<section class="editor-cat"><h2>À surveiller</h2><div class="editor-list">' + alerts.map(stockRowHTML).join('') + '</div></section>' : '') +
      menu.categories.map(function (c) {
        var list = items.filter(function (i) { return i.category === c.id && (q || alerts.indexOf(i) < 0); });
        if (!list.length) return '';
        return '<section class="editor-cat"><h2>' + esc(c.label) + '</h2><div class="editor-list">' + list.map(stockRowHTML).join('') + '</div></section>';
      }).join('') +
    '</div>';

    var view = $('#stockView');
    var active = document.activeElement && /^(stockSearch|fcContext)$/.test(document.activeElement.id) ? document.activeElement.id : null;
    var caret = active ? document.activeElement.selectionStart : 0;
    var typed = $('#fcContext') ? $('#fcContext').value : null;
    view.innerHTML = html;
    if ($('#supplierBlock')) window.TapigoSuppliers.mount($('#supplierBlock'), {
      manager: !LIVE || T.currentRestaurant().role !== 'equipe', advice: advice, hasForecast: function () { return !!fc.data; }
    });
    if (typed !== null && $('#fcContext')) $('#fcContext').value = typed;
    if (active) { var s = $('#' + active); s.focus(); s.setSelectionRange(caret, caret); }
    updateStockBadge();
  }

  function applyQty(id, value) {
    var item = T.getItem(id);
    if (!item) return;
    var q = value === '' || value == null ? null : Math.max(0, Math.min(100000, parseInt(value, 10) || 0));
    T.setStock(id, q);
    if (q === 0) UI.toast('<strong>' + esc(item.name) + '</strong> épuisé · retiré de la carte client');
  }

  /* ======================================================================
     Dates limites (DLC / DDM) — cuisine et bar, chacun voit son poste ;
     le gérant voit tout.
     ====================================================================== */
  var dates = { zone: 'all', view: 'list', lossDays: 'month', moves: null, movesErr: '' };
  var ZONE = { cuisine: 'Cuisine', bar: 'Bar' };
  var KIND = { dlc: 'DLC', ddm: 'DDM / DLUO' };
  var UNITS = { portion: 'portions', piece: 'pièces', g: 'g', kg: 'kg', cl: 'cl', l: 'L' };
  var LOSS_REASONS = ['Date dépassée', 'Abîmé / mauvais état', 'Erreur de préparation', 'Retour client', 'Autre'];

  function qtyText(n, unit) {
    var v = Math.round(n * 1000) / 1000;
    var txt = String(v).replace('.', ',');
    if (unit === 'portion') return txt + ' portion' + (v > 1 ? 's' : '');
    if (unit === 'piece') return txt + ' pièce' + (v > 1 ? 's' : '');
    return txt + ' ' + UNITS[unit];
  }
  // Unités proposées pour un lot : celles de sa famille (masse, volume) ou toutes.
  function unitChoices(x) {
    if (x.portions != null) return ['portion'];
    if (x.unit === 'g' || x.unit === 'kg') return ['g', 'kg'];
    if (x.unit === 'cl' || x.unit === 'l') return ['cl', 'l'];
    if (x.unit) return [x.unit];
    return ['piece', 'g', 'kg', 'cl', 'l'];
  }
  // « 1 L », « 4 × 125 g », « 2,5 kg » -> { amount, unit } (étiquette lue par l'IA).
  function parseQty(t) {
    var m = /(\d+(?:[.,]\d+)?)\s*(kg|g|cl|l)\b/i.exec(String(t || ''));
    if (m) return { amount: parseFloat(m[1].replace(',', '.')), unit: m[2].toLowerCase() };
    m = /(\d+)\s*(pi[eè]ces?|unit[eé]s?|bouteilles?|canettes?)/i.exec(String(t || ''));
    return m ? { amount: +m[1], unit: 'piece' } : null;
  }

  function todayISO(offset) {
    var d = new Date(); d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysLeft(iso) { return Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(todayISO() + 'T12:00:00')) / 86400000); }
  function myZone() { return T.expiry ? T.expiry.station() : 'all'; }

  function datesOpen() {
    var list = T.expiry && T.expiry.list();
    return (list || []).filter(function (x) { return x.status === 'actif'; });
  }

  // Badge : produits dépassés ou à utiliser aujourd'hui / demain.
  function updateDatesBadge() {
    var n = datesOpen().filter(function (x) { return daysLeft(x.expiresOn) <= 1; }).length;
    var c = $('#datesCount');
    if (!c) return;
    c.hidden = !n;
    c.textContent = n;
  }

  function dateRowHTML(x) {
    var d = daysLeft(x.expiresOn);
    var when = d < 0 ? (x.kind === 'dlc' ? 'Dépassée depuis ' + (-d) + ' j · à jeter' : 'Dépassée depuis ' + (-d) + ' j · à vérifier')
      : d === 0 ? 'Aujourd’hui' : d === 1 ? 'Demain' : 'Dans ' + d + ' jours';
    var state = d < 0 ? 'late' : d <= 1 ? 'soon' : d <= 3 ? 'week' : 'ok';
    var date = new Date(x.expiresOn + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    return '<div class="date-row date-row--' + state + '" data-exp="' + esc(x.id) + '">' +
      '<div class="date-row__when"><b>' + esc(date) + '</b><small>' + esc(when) + '</small></div>' +
      '<div class="date-row__name"><strong>' + esc(x.label) + '</strong>' +
        '<span><span class="badge ' + (x.kind === 'dlc' ? 'badge--danger' : 'badge--info') + '">' + KIND[x.kind] + '</span> ' +
        (myZone() === 'all' ? '<span class="badge">' + ZONE[x.station] + '</span> ' : '') +
        (x.portions != null ? '<strong>reste ' + qtyText(x.portions, 'portion') + '</strong> · décompté par les commandes'
          : x.amount != null ? '<strong>reste ' + qtyText(x.amount, x.unit) + '</strong>'
          : (x.quantity ? esc(x.quantity) : '')) +
        (x.note ? ' · ' + esc(x.note) : '') + '</span></div>' +
      '<div class="date-row__actions">' +
        // Lot rattaché à un produit de la carte : il se vide tout seul avec les commandes.
        (x.portions != null ? '' : '<button class="btn btn--soft btn--sm" type="button" data-exp-move="utilise">Utilisé</button>') +
        '<button class="btn btn--danger btn--sm" type="button" data-exp-move="jete">Jeté</button>' +
        '<button class="icon-btn" type="button" data-exp-done="supprime" aria-label="Supprimer (saisie par erreur)" title="Supprimer (saisie par erreur)">' + I.trash + '</button>' +
      '</div></div>';
  }

  function renderDates() {
    if (dates.view === 'losses') return renderLosses();
    var view = $('#datesView');
    var list = T.expiry && T.expiry.list();
    if (list === null) {
      view.innerHTML = '<div class="empty"><h3>Dates limites pas encore activées</h3><p>Relancez supabase/schema.sql dans Supabase (SQL Editor) pour activer la gestion des DLC / DDM.</p></div>';
      return;
    }
    var zone = myZone();
    var shown = datesOpen().filter(function (x) { return zone !== 'all' || dates.zone === 'all' || x.station === dates.zone; })
      .sort(function (a, b) { return a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : a.label.localeCompare(b.label, 'fr'); });
    var groups = [
      ['Dépassées', function (d) { return d < 0; }],
      ['Aujourd’hui et demain', function (d) { return d >= 0 && d <= 1; }],
      ['Dans les 7 jours', function (d) { return d >= 2 && d <= 7; }],
      ['Plus tard', function (d) { return d > 7; }]
    ];
    var monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    var thrown = (list || []).filter(function (x) {
      return x.status === 'jete' && x.closedAt >= monthStart.getTime() && (zone !== 'all' || dates.zone === 'all' || x.station === dates.zone);
    }).length;
    var count = function (f) { return shown.filter(function (x) { return f(daysLeft(x.expiresOn)); }).length; };

    view.innerHTML = '<div class="editor">' +
      '<div class="dates-bar">' +
        (zone === 'all'
          ? '<div class="seg" role="group" aria-label="Poste">' + [['all', 'Tout'], ['cuisine', 'Cuisine'], ['bar', 'Bar']].map(function (z) {
              return '<button type="button" data-zone="' + z[0] + '" aria-pressed="' + (dates.zone === z[0]) + '">' + z[1] + '</button>';
            }).join('') + '</div>'
          : '<span class="badge badge--info">Poste : ' + ZONE[zone] + '</span>') +
        '<div class="k-top__spacer"></div>' +
        (LIVE && T.expiry.team && T.currentRestaurant().role !== 'equipe' ? '<button class="btn btn--ghost btn--sm" type="button" data-exp-team>Postes de l’équipe</button>' : '') +
        (T.expiry.moves ? '<button class="btn btn--ghost btn--sm" type="button" data-losses>Bilan des pertes</button>' : '') +
        '<button class="btn btn--primary btn--sm" type="button" data-exp-add>+ Ajouter un produit daté</button>' +
      '</div>' +
      '<div class="stat-tiles">' +
        '<div class="stat-tile"><span>Dépassées</span><b>' + count(groups[0][1]) + '</b><small>à retirer ou vérifier</small></div>' +
        '<div class="stat-tile"><span>Aujourd’hui et demain</span><b>' + count(groups[1][1]) + '</b><small>à utiliser en priorité</small></div>' +
        '<div class="stat-tile"><span>Suivis</span><b>' + shown.length + '</b><small>produits datés en stock</small></div>' +
        '<div class="stat-tile"><span>Jetés ce mois-ci</span><b>' + thrown + '</b><small>pour suivre le gaspillage</small></div>' +
      '</div>' +
      (window.TapigoAntigaspi ? '<div id="antigaspiBlock"></div>' : '') +
      (shown.length ? groups.map(function (g) {
        var rows = shown.filter(function (x) { return g[1](daysLeft(x.expiresOn)); });
        return rows.length ? '<section class="editor-cat"><h2>' + g[0] + '</h2><div class="editor-list">' + rows.map(dateRowHTML).join('') + '</div></section>' : '';
      }).join('') : '<div class="empty"><h3>Aucun produit daté</h3><p>Ajoutez les produits frais ou ouverts avec leur date : Tapigo vous prévient avant qu’ils ne dépassent.</p></div>') +
      '<p class="help"><strong>DLC</strong> (« à consommer jusqu’au ») : date impérative, le produit ne doit plus être servi après. ' +
        '<strong>DDM / DLUO</strong> (« à consommer de préférence avant ») : le produit reste consommable après, mais sa qualité n’est plus garantie. ' +
        'Pensez à dater aussi les produits ouverts (sauces, lait, bouteilles entamées). ' +
        'Un lot rattaché à un produit de la carte se décompte tout seul à chaque commande, le plus proche de sa date d’abord.</p>' +
    '</div>';
    if ($('#antigaspiBlock')) window.TapigoAntigaspi.mount($('#antigaspiBlock'), {
      manager: !LIVE || T.currentRestaurant().role !== 'equipe', zone: zone, daysLeft: daysLeft
    });
  }

  /* ---------------- Utilisé / Jeté : quantité et motif ---------------- */
  function openMove(x, kind) {
    var units = unitChoices(x);
    var left = x.portions != null ? x.portions : x.amount;
    var leftUnit = x.portions != null ? 'portion' : x.unit;
    UI.openSheet({
      label: kind === 'jete' ? 'Perte' : 'Utilisé',
      head: '<p class="eyebrow">' + esc(x.label) + '</p><h2>' + (kind === 'jete' ? 'Déclarer une perte' : 'Quantité utilisée') + '</h2>',
      body: '<form id="moveForm" class="form-grid" novalidate>' +
        (left != null ? '<p class="help span-2">Reste dans ce lot : <strong>' + qtyText(left, leftUnit) + '</strong>' +
          (x.portions != null && kind === 'jete' ? ' · les portions jetées sortent aussi du stock' : '') + '</p>' : '') +
        '<label class="field"><span>Quantité</span><input name="amount" type="number" min="0" step="any" inputmode="decimal" placeholder="Ex : 250" autofocus></label>' +
        '<label class="field"><span>Unité</span><select name="unit">' + units.map(function (u) {
          return '<option value="' + u + '"' + (u === leftUnit ? ' selected' : '') + '>' + UNITS[u] + '</option>';
        }).join('') + '</select></label>' +
        '<label class="check-line span-2"><input type="checkbox" name="all"><span>' + (left != null ? 'Tout ce qui reste (' + qtyText(left, leftUnit) + ')' : 'Le lot est terminé (le retirer de la liste)') + '</span></label>' +
        (kind === 'jete'
          ? '<div class="span-2"><p class="help" style="margin-bottom:6px">Motif</p><div class="tip-chips onsite-chips loss-reasons">' + LOSS_REASONS.map(function (r, i) {
              return '<button type="button" class="tip-chip' + (i === 0 ? ' is-on' : '') + '" data-reason="' + esc(r) + '"><b>' + esc(r) + '</b></button>';
            }).join('') + '</div></div>'
          : '') +
      '</form>',
      footer: '<button class="btn ' + (kind === 'jete' ? 'btn--danger' : 'btn--primary') + '" type="submit" form="moveForm">' + (kind === 'jete' ? 'Enregistrer la perte' : 'Enregistrer') + '</button>',
      onMount: function (sheet) {
        var form = $('#moveForm', sheet), reason = LOSS_REASONS[0];
        sheet.addEventListener('click', function (e) {
          var r = e.target.closest('[data-reason]');
          if (!r) return;
          reason = r.dataset.reason;
          sheet.querySelectorAll('[data-reason]').forEach(function (b) { b.classList.toggle('is-on', b === r); });
        });
        form.elements.all.addEventListener('change', function (e) {
          if (e.target.checked && left != null) { form.elements.amount.value = String(left); form.elements.unit.value = leftUnit; }
        });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var f = form.elements, all = f.all.checked;
          var amount = parseFloat(String(f.amount.value).replace(',', '.'));
          if (!all && !(amount > 0)) { f.amount.focus(); return UI.toast('Indiquez la quantité'); }
          if (all && left == null && !(amount > 0)) return UI.toast('Indiquez la quantité, même approximative, pour le bilan');
          var btn = sheet.querySelector('[type="submit"]');
          if (btn) btn.disabled = true;
          T.expiry.move(x.id, kind, amount > 0 ? amount : null, f.unit.value, kind === 'jete' ? reason : '', all).then(function () {
            UI.closeSheet();
            UI.toast('<strong>' + esc(x.label) + '</strong> · ' + (kind === 'jete' ? 'perte enregistrée' : 'utilisation enregistrée'));
            dates.moves = null;
            renderDates();
          }, function (err) { if (btn) btn.disabled = false; UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  /* ---------------- Bilan des pertes matières ---------------- */
  function lossRange() {
    var now = new Date(), from, to = Date.now(), label;
    if (dates.lossDays === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); label = 'ce mois-ci'; }
    else if (dates.lossDays === 'prev') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); label = 'le mois dernier'; }
    else { from = new Date(Date.now() - 30 * 86400000); label = 'sur 30 jours'; }
    return { from: from.getTime(), to: to, label: label };
  }

  function loadMoves() {
    dates.moves = 'loading'; dates.movesErr = '';
    T.expiry.moves(70).then(function (list) { dates.moves = list; }, function (err) { dates.moves = []; dates.movesErr = err.message; })
      .then(function () { if (state.view === 'dates' && dates.view === 'losses') renderLosses(); });
  }

  // Somme par produit et par famille d'unité (g et kg ensemble, cl et L ensemble).
  function lossTotals(list) {
    var byItem = {}, byReason = {}, value = 0, valued = 0, cost = 0, costed = 0;
    list.forEach(function (m) {
      var fam = m.unit === 'kg' || m.unit === 'g' ? 'g' : m.unit === 'l' || m.unit === 'cl' ? 'cl' : m.unit;
      var base = m.unit === 'kg' ? m.amount * 1000 : m.unit === 'l' ? m.amount * 100 : m.amount;
      var key = m.label.toLowerCase() + '|' + m.station;
      var it = byItem[key] || (byItem[key] = { label: m.label, station: m.station, qty: {}, count: 0, value: 0, cost: 0, costed: false });
      if (m.cost != null) { it.cost += m.cost; it.costed = true; cost += m.cost; costed++; }
      it.qty[fam] = (it.qty[fam] || 0) + base; it.count++;
      if (m.value != null) { it.value += m.value; value += m.value; valued++; }
      byReason[m.reason || 'Autre'] = (byReason[m.reason || 'Autre'] || 0) + 1;
    });
    var fmtQty = function (q) {
      return Object.keys(q).map(function (fam) {
        var v = q[fam];
        if (fam === 'g') return v >= 1000 ? qtyText(v / 1000, 'kg') : qtyText(v, 'g');
        if (fam === 'cl') return v >= 100 ? qtyText(v / 100, 'l') : qtyText(v, 'cl');
        return qtyText(v, fam);
      }).join(' + ');
    };
    var items = Object.keys(byItem).map(function (k) { var it = byItem[k]; it.qtyText = fmtQty(it.qty); return it; })
      .sort(function (a, b) { return b.cost - a.cost || b.value - a.value || b.count - a.count; });
    return { items: items, reasons: byReason, value: value, valued: valued, cost: cost, costed: costed };
  }

  function renderLosses() {
    var view = $('#datesView'), zone = myZone();
    if (dates.moves === null) loadMoves();
    var head = '<div class="dates-bar">' +
      '<button class="btn btn--ghost btn--sm" type="button" data-losses-back>← Dates</button>' +
      '<div class="seg" role="group" aria-label="Période">' + [['month', 'Ce mois-ci'], ['prev', 'Mois dernier'], ['30', '30 jours']].map(function (p) {
        return '<button type="button" data-loss-days="' + p[0] + '" aria-pressed="' + (dates.lossDays === p[0]) + '">' + p[1] + '</button>';
      }).join('') + '</div>' +
      (zone === 'all' ? '<div class="seg" role="group" aria-label="Poste">' + [['all', 'Tout'], ['cuisine', 'Cuisine'], ['bar', 'Bar']].map(function (z) {
        return '<button type="button" data-zone="' + z[0] + '" aria-pressed="' + (dates.zone === z[0]) + '">' + z[1] + '</button>';
      }).join('') + '</div>' : '<span class="badge badge--info">Poste : ' + ZONE[zone] + '</span>') +
      '</div>';
    if (dates.moves === 'loading') { view.innerHTML = '<div class="editor">' + head + '<p class="help"><span class="spinner"></span> Chargement…</p></div>'; return; }
    var r = lossRange();
    var inRange = (dates.moves || []).filter(function (m) {
      return m.at >= r.from && m.at < r.to && (zone !== 'all' || dates.zone === 'all' || m.station === dates.zone);
    });
    var losses = inRange.filter(function (m) { return m.kind === 'jete'; });
    var used = inRange.filter(function (m) { return m.kind === 'utilise'; }).length;
    var t = lossTotals(losses);
    var reasons = Object.keys(t.reasons).sort(function (a, b) { return t.reasons[b] - t.reasons[a]; });
    view.innerHTML = '<div class="editor">' + head +
      '<h2 style="font-size:30px">Pertes matières ' + esc(r.label) + '</h2>' +
      (dates.movesErr ? '<p class="help" style="color:var(--danger)">' + esc(dates.movesErr) + '</p>' : '') +
      '<div class="stat-tiles">' +
        '<div class="stat-tile"><span>Pertes déclarées</span><b>' + losses.length + '</b><small>lots ou parties de lots jetés</small></div>' +
        '<div class="stat-tile"><span>Coût matière perdu</span><b>' + (t.costed ? fmt(t.cost) : '—') + '</b><small>' +
          (t.costed ? 'prix d’achat HT' + (t.costed < losses.length ? ' · ' + (losses.length - t.costed) + ' perte' + (losses.length - t.costed > 1 ? 's' : '') + ' sans prix' : '') : 'aucun prix d’achat connu') +
          (t.valued ? ' · ' + fmt(t.value) + ' au prix de vente' : '') + '</small></div>' +
        '<div class="stat-tile"><span>Produits concernés</span><b>' + t.items.length + '</b><small>' + used + ' utilisation' + (used > 1 ? 's' : '') + ' saisie' + (used > 1 ? 's' : '') + ' en plus</small></div>' +
        '<div class="stat-tile"><span>Motif principal</span><b style="font-size:20px">' + (reasons[0] ? esc(reasons[0]) : '—') + '</b><small>' + (reasons[0] ? t.reasons[reasons[0]] + ' perte' + (t.reasons[reasons[0]] > 1 ? 's' : '') : '') + '</small></div>' +
      '</div>' +
      (losses.length
        ? '<section class="chart-card"><h3>Par produit</h3><div style="overflow-x:auto"><table class="loss-table"><thead><tr><th>Produit</th><th>Poste</th><th>Quantité jetée</th><th>Pertes</th><th>Coût HT</th><th>Prix de vente</th></tr></thead><tbody>' +
            t.items.map(function (it) {
              return '<tr><td><strong>' + esc(it.label) + '</strong></td><td>' + ZONE[it.station] + '</td><td>' + esc(it.qtyText) + '</td><td>' + it.count + '</td><td>' + (it.costed ? fmt(it.cost) : '—') + '</td><td>' + (it.value ? fmt(it.value) : '—') + '</td></tr>';
            }).join('') + '</tbody></table></div></section>' +
          '<div class="stats-grid">' +
            '<section class="chart-card"><h3>Par motif</h3><ul class="bilan__facts">' + reasons.map(function (k) { return '<li><span>' + esc(k) + '</span><strong>' + t.reasons[k] + '</strong></li>'; }).join('') + '</ul></section>' +
            '<section class="chart-card"><h3>Dernières pertes</h3><ul class="bilan__facts">' + losses.slice(0, 8).map(function (m) {
              return '<li><span>' + esc(new Date(m.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) + ' · ' + esc(m.label) + (m.reason ? ' · ' + esc(m.reason) : '') + '</span><strong>' + esc(qtyText(m.amount, m.unit)) + '</strong></li>';
            }).join('') + '</ul></section>' +
          '</div>'
        : '<div class="empty"><h3>Aucune perte déclarée ' + esc(r.label) + '</h3><p>Quand un produit est jeté, touchez « Jeté » sur sa ligne et indiquez la quantité : la perte apparaît ici.</p></div>') +
      '<p class="help">Coût matière : prix d’achat HT relevé sur les bons de livraison scannés (ou saisi à l’ajout du lot). ' +
        'Prix de vente : pour les produits de la carte vendus tels quels.</p>' +
    '</div>';
  }

  // Gérant : poste de chaque compte équipe (ce qu'il voit dans les dates limites).
  function openTeamStations() {
    UI.openSheet({
      label: 'Postes de l’équipe',
      head: '<p class="eyebrow">Dates limites</p><h2>Postes de l’équipe</h2>',
      body: '<p class="help">Chaque compte « Équipe » ne voit que les produits datés de son poste. Le gérant voit tout.</p><div class="order-list" id="teamList" style="margin-top:12px"><p class="help"><span class="spinner"></span> Chargement…</p></div>',
      onMount: function (sheet) {
        var box = $('#teamList', sheet);
        T.expiry.team().then(function (list) {
          var team = (list || []).filter(function (m) { return m.role === 'equipe'; });
          box.innerHTML = team.length ? team.map(function (m) {
            return '<div class="order-link"><span><strong>' + esc(m.email) + '</strong></span>' +
              '<select class="member-station" data-team-station="' + esc(m.user_id) + '" aria-label="Poste de ' + esc(m.email) + '">' +
                [['all', 'Cuisine et bar'], ['cuisine', 'Cuisine'], ['bar', 'Bar']].map(function (o) {
                  return '<option value="' + o[0] + '"' + ((m.station || 'all') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
                }).join('') + '</select></div>';
          }).join('') : '<p class="help">Aucun compte « Équipe » pour l’instant. Demandez à l’équipe Tapigo de créer les accès de vos serveurs et cuisiniers.</p>';
        }, function (err) { box.innerHTML = '<p class="login__error">' + esc(err.message) + '</p>'; });
        sheet.addEventListener('change', function (e) {
          if (!e.target.matches('[data-team-station]')) return;
          T.expiry.setStation(e.target.dataset.teamStation, e.target.value)
            .then(function () { UI.toast('Poste enregistré'); }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  function openDateForm() {
    var zone = myZone();
    var items = T.getMenu().items.filter(function (i) { return zone === 'all' || (i.station || 'cuisine') === zone; });
    UI.openSheet({
      label: 'Produit daté',
      head: '<p class="eyebrow">Dates limites</p><h2>Ajouter un produit daté</h2>',
      body: '<form id="dateForm" class="form-grid" novalidate>' +
        (T.expiry.readLabel
          ? '<div class="span-2 label-scan"><label class="btn btn--soft btn--sm">' + I.camera.replace('<svg ', '<svg width="16" height="16" ') +
              ' <span data-label-btn>Lire l’étiquette</span><input type="file" accept="image/*" capture="environment" data-label-file hidden></label>' +
              '<small class="help" data-label-help>Photographiez la date sur l’emballage : le formulaire se remplit tout seul.</small></div>'
          : '') +
        '<label class="field span-2"><span>Produit</span><input name="label" maxlength="80" list="dateItems" placeholder="Ex : crème liquide, burrata, lait…" autofocus>' +
          '<datalist id="dateItems">' + items.map(function (i) { return '<option value="' + esc(i.name) + '">'; }).join('') + '</datalist></label>' +
        (zone === 'all'
          ? '<label class="field"><span>Poste</span><select name="station"><option value="cuisine"' + (dates.zone === 'bar' ? '' : ' selected') + '>Cuisine</option><option value="bar"' + (dates.zone === 'bar' ? ' selected' : '') + '>Bar</option></select></label>'
          : '<input type="hidden" name="station" value="' + zone + '">') +
        '<label class="field"><span>Type de date</span><select name="kind"><option value="dlc">DLC · à consommer jusqu’au</option><option value="ddm">DDM / DLUO · de préférence avant</option></select></label>' +
        '<label class="field"><span>Date limite</span><input name="date" type="date" value="' + todayISO(3) + '" min="' + todayISO(-30) + '"></label>' +
        '<div class="field" data-amount-field><span>Quantité du lot</span><div class="qty-unit"><input name="amount" type="number" min="0" step="any" inputmode="decimal" placeholder="Ex : 2">' +
          '<select name="unit" aria-label="Unité">' + ['piece', 'g', 'kg', 'cl', 'l'].map(function (u) { return '<option value="' + u + '"' + (u === 'kg' ? ' selected' : '') + '>' + UNITS[u] + '</option>'; }).join('') + '</select></div>' +
          '<small class="help">Pour suivre ce qui est utilisé ou jeté.</small></div>' +
        '<label class="field" data-cost-field><span>Prix d’achat HT du lot (facultatif)</span><input name="cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Ex : 8,70">' +
          '<small class="help">Pour chiffrer les pertes en coût matière.</small></label>' +
        '<input type="hidden" name="quantity">' +
        '<label class="field" data-portions-field hidden><span>Portions de ce lot</span><input name="portions" type="number" min="1" max="100000" inputmode="numeric" placeholder="Ex : 12">' +
          '<small class="help">Produit de la carte : le lot se vide tout seul avec les commandes.</small></label>' +
        '<label class="field span-2"><span>Note (facultatif)</span><input name="note" maxlength="140" placeholder="Ex : ouvert le 28/10, lot n°…"></label>' +
        '<div class="span-2 date-quick">' + [[0, 'Aujourd’hui'], [1, 'Demain'], [3, '+3 jours'], [7, '+7 jours']].map(function (q) {
          return '<button type="button" class="btn btn--ghost btn--sm" data-quick="' + q[0] + '">' + q[1] + '</button>';
        }).join('') + '</div>' +
      '</form>',
      footer: '<button class="btn btn--primary" type="submit" form="dateForm">Ajouter</button>',
      onMount: function (sheet) {
        var form = $('#dateForm', sheet);
        // Portions proposées seulement pour un produit de la carte (décompte automatique).
        var syncPortions = function () {
          var v = form.elements.label.value.trim().toLowerCase();
          var hit = items.filter(function (i) { return i.name.toLowerCase() === v; })[0];
          $('[data-portions-field]', sheet).hidden = !hit;
          $('[data-amount-field]', sheet).hidden = !!hit;
          $('[data-cost-field]', sheet).hidden = !!hit; // produit de la carte : coût relevé sur les bons
        };
        form.elements.label.addEventListener('input', syncPortions);
        sheet.addEventListener('change', function (e) {
          if (e.target.name === 'label') syncPortions();
          if (!e.target.matches('[data-label-file]') || !e.target.files[0]) return;
          var file = e.target.files[0], btnText = $('[data-label-btn]', sheet), help = $('[data-label-help]', sheet);
          e.target.value = '';
          btnText.innerHTML = '<span class="spinner"></span> Lecture…';
          fileToPage(file).then(T.expiry.readLabel).then(function (r) {
            var f = form.elements;
            if (r.label) { f.label.value = r.label; syncPortions(); }
            if (r.expires_on) f.date.value = r.expires_on;
            if (r.kind) f.kind.value = r.kind;
            if (r.quantity) {
              f.quantity.value = r.quantity;
              var pq = parseQty(r.quantity);
              if (pq) { f.amount.value = String(pq.amount); f.unit.value = pq.unit; }
            }
            if (r.lot && !f.note.value) f.note.value = 'Lot ' + r.lot;
            help.textContent = r.warning || 'Étiquette lue : vérifiez les informations, puis « Ajouter ».';
            help.style.color = r.warning ? 'var(--danger)' : '';
          }, function (err) { help.textContent = err.message; help.style.color = 'var(--danger)'; })
            .then(function () { btnText.textContent = 'Lire l’étiquette'; });
        });
        sheet.addEventListener('click', function (e) {
          var q = e.target.closest('[data-quick]');
          if (q) form.elements.date.value = todayISO(+q.dataset.quick);
        });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var f = form.elements;
          var label = f.label.value.trim();
          if (!label) { f.label.focus(); return UI.toast('Indiquez le produit'); }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date.value)) return UI.toast('Indiquez la date limite');
          var match = items.filter(function (i) { return i.name.toLowerCase() === label.toLowerCase(); })[0];
          var btn = sheet.querySelector('[type="submit"]');
          if (btn) btn.disabled = true;
          T.expiry.add({ station: f.station.value, label: label, itemId: match ? match.id : null, kind: f.kind.value,
            expiresOn: f.date.value, quantity: match ? '' : (parseFloat(String(f.amount.value).replace(',', '.')) > 0 ? f.amount.value + ' ' + UNITS[f.unit.value] : f.quantity.value.trim()), note: f.note.value.trim(),
            portions: match ? (parseInt(f.portions.value, 10) || null) : null,
            amount: match ? null : (parseFloat(String(f.amount.value).replace(',', '.')) || null), unit: f.unit.value,
            unitCost: (function () {
              var c = parseFloat(String(f.cost.value).replace(',', '.')), a = parseFloat(String(f.amount.value).replace(',', '.'));
              return !match && c >= 0 && a > 0 ? c / a : null;
            })() })
            .then(function () { UI.closeSheet(); UI.toast('<strong>' + esc(label) + '</strong> ajouté'); renderDates(); },
              function (err) { if (btn) btn.disabled = false; UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  /* ======================================================================
     Statistiques
     ====================================================================== */
  var statsDays = 30;
  function renderStats() {
    var cur = LIVE ? T.currentRestaurant() : null;
    window.TapigoStats.render($('#statsView'), {
      days: statsDays,
      load: function (days) { if ([7, 30, 90].indexOf(days) >= 0) statsDays = days; return T.loadStats(days); },
      // Données fictives : réservé à l'équipe Tapigo (ou au mode démo) pour présenter l'outil.
      demoTools: !LIVE || (cur && cur.role === 'admin'),
      seed: function () {
        return LIVE ? T.admin.seedDemo(cur.id, 30) : Promise.resolve(T.seedDemoOrders(30));
      },
      clear: function () {
        return LIVE ? T.admin.clearDemo(cur.id) : Promise.resolve(T.clearDemoOrders());
      },
      restaurantName: T.getRestaurant().name
    });
  }

  /* ======================================================================
     Navigation & événements
     ====================================================================== */
  function renderBrand() {
    var r = T.getRestaurant();
    $('#kName').textContent = r.name;
    $('#kLogo').textContent = (r.logoLetter || r.name || 'T').charAt(0).toUpperCase();
    updateBadges();
  }

  function renderSound() {
    var b = $('#soundBtn');
    b.setAttribute('aria-pressed', String(state.sound));
    b.setAttribute('aria-label', state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores');
    b.innerHTML = state.sound ? I.sound : I.mute;
  }

  function setSound(on) {
    state.sound = on;
    T.write(SOUND_KEY, on);
    if (on) { UI.unlockAudio(); UI.chime(); UI.toast('Alertes sonores activées'); }
    renderSound();
    if (state.view === 'orders') renderOrders();
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll('.k-tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.view === v)); });
    $('#ordersView').hidden = v !== 'orders';
    $('#menuView').hidden = v !== 'menu';
    $('#statsView').hidden = v !== 'stats';
    $('#stockView').hidden = v !== 'stock';
    $('#datesView').hidden = v !== 'dates';
    $('#marginsView').hidden = v !== 'margins';
    $('#haccpView').hidden = v !== 'haccp';
    if (v === 'orders') renderOrders();
    else if (v === 'dates') renderDates();
    else if (v === 'menu') renderMenuEditor();
    else if (v === 'stock') renderStock();
    else if (v === 'margins') window.TapigoMargins.mount($('#marginsView'));
    else if (v === 'haccp') window.TapigoHaccp.mount($('#haccpView'), {
      manager: !LIVE || T.currentRestaurant().role !== 'equipe', zone: myZone(), restaurantName: (T.getRestaurant() || {}).name || ''
    });
    else renderStats();
  }

  function bind() {
    $('#boltIcon').outerHTML = I.bolt.replace('<svg ', '<svg width="16" height="16" ');

    document.querySelector('.k-tabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-view]');
      if (t) setView(t.dataset.view);
    });
    $('#soundBtn').addEventListener('click', function () { setSound(!state.sound); });
    $('#simulateBtn').addEventListener('click', simulateOrder);
    $('#pauseBtn').addEventListener('click', function () {
      var paused = !T.getRestaurant().ordersPaused;
      if (paused && !confirm('Suspendre les commandes en ligne ? Les clients verront « Commandes en pause » jusqu’à la reprise.')) return;
      T.setOrdersPaused(paused);
      renderPause();
      UI.toast(paused ? '⏸ Commandes en ligne suspendues' : '▶ Commandes en ligne reprises');
    });

    setInterval(remind, 30000);
    keepAwake();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) keepAwake(); });
    window.addEventListener('online', function () { renderOnline(); UI.toast('Connexion rétablie'); });
    window.addEventListener('offline', renderOnline);
    renderOnline();

    // Les navigateurs exigent un geste utilisateur avant de jouer un son.
    document.addEventListener('pointerdown', function unlock() {
      if (state.sound) UI.unlockAudio();
      document.removeEventListener('pointerdown', unlock);
    });

    $('#ordersView').addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-layout]'))) { state.layout = t.dataset.layout; savePrefs(); return renderOrders(); }
      if ((t = e.target.closest('[data-station]'))) { state.station = t.dataset.station; savePrefs(); return renderOrders(); }
      if (e.target.closest('[data-enable-sound]')) return setSound(true);
      if ((t = e.target.closest('[data-reopen]'))) return T.updateOrderStatus(t.dataset.reopen, 'servie');
      if ((t = e.target.closest('[data-new-order]'))) return openOrderPad(t.dataset.newOrder || '');
      if ((t = e.target.closest('[data-servers]'))) return openServers(t.dataset.servers || '');
      if ((t = e.target.closest('[data-check-pay]'))) {
        t.disabled = true; t.textContent = 'Vérification…';
        return T.payments.sync(t.dataset.checkPay).then(function (r) {
          UI.toast(r.paid ? 'Paiement confirmé : la commande arrive en cuisine'
            : r.cancelled ? 'Paiement non abouti : commande annulée, stock rendu'
            : 'Le client n’a pas encore payé (page de paiement ouverte)', 5000);
          renderOrders();
        }, function (err) { UI.toast(esc(err.message), 5000); renderOrders(); });
      }
      if ((t = e.target.closest('[data-pay-onsite]'))) {
        var po = T.payments.awaiting().filter(function (x) { return x.id === t.dataset.payOnsite; })[0];
        if (!po) return renderOrders();
        return openOnsitePay(po);
      }
      if ((t = e.target.closest('[data-pay-cancel]'))) {
        var pc = T.payments.awaiting().filter(function (x) { return x.id === t.dataset.payCancel; })[0];
        if (!pc) return renderOrders();
        if (!confirm('Annuler la commande n° ' + pc.number + ' (table ' + pc.table + ', ' + fmt(pc.total) + ') ?\n\nElle n’a pas été payée : elle est supprimée, le stock est rendu et la page de paiement du client est fermée.')) return;
        t.disabled = true; t.textContent = 'Annulation…';
        return T.payments.cancel(pc.id).then(function (r) {
          UI.toast(r && r.paid ? 'Le client vient de payer en ligne : la commande est conservée' : r && r.cancelled === false ? 'Paiement peut-être en cours chez Stripe : réessayez dans une minute' : 'Commande n° ' + pc.number + ' annulée, stock rendu', 5000);
          renderOrders();
        }, function (err) { UI.toast(esc(err.message), 5000); renderOrders(); });
      }
      if ((t = e.target.closest('[data-request-done]'))) { T.completeServiceRequest(t.dataset.requestDone); return renderOrders(); }
      if ((t = e.target.closest('[data-close-table]'))) {
        var tb = t.dataset.closeTable;
        if (confirm('Toute la table ' + tb + ' est encaissée ? Ses commandes passent en « Terminée ».')) {
          T.closeTable(tb);
          UI.toast('Table <strong>' + esc(tb) + '</strong> clôturée');
        }
        return;
      }

      var ticket = e.target.closest('[data-order]');
      if (!ticket) return;
      if (e.target.closest('[data-print]')) return printTicket(ticket.dataset.order);
      if (e.target.closest('[data-validate]')) {
        var v = T.getOrders().filter(function (x) { return x.id === ticket.dataset.order; })[0];
        if (!v) return;
        if (v.payment.status !== 'paid' && !confirm('Valider la commande n° ' + v.number + ' (table ' + v.table + ') ?\n\nElle passe en « Terminée » et elle est notée comme encaissée (' + fmt(v.total) + ').')) return;
        var done = T.updateOrderStatus(v.id, 'terminee');
        if (done) UI.toast('Table ' + esc(done.table) + ' · commande n° ' + done.number + ' validée');
        return;
      }
      var btn = e.target.closest('.st-btn');
      if (btn && !btn.classList.contains('is-active')) {
        var o = T.updateOrderStatus(ticket.dataset.order, btn.dataset.status);
        if (o && o.status === 'terminee') UI.toast('Table ' + esc(o.table) + ' · commande n° ' + o.number + ' terminée');
      } else if (ticket.classList.contains('is-new')) {
        T.markSeen(ticket.dataset.order);
      }
    });

    $('#datesView').addEventListener('click', function (e) {
      var z = e.target.closest('[data-zone]');
      if (z) { dates.zone = z.dataset.zone; return renderDates(); }
      if (e.target.closest('[data-exp-add]')) return openDateForm();
      if (e.target.closest('[data-exp-team]')) return openTeamStations();
      if (e.target.closest('[data-losses]')) { dates.view = 'losses'; dates.moves = null; return renderDates(); }
      if (e.target.closest('[data-losses-back]')) { dates.view = 'list'; return renderDates(); }
      var ld = e.target.closest('[data-loss-days]');
      if (ld) { dates.lossDays = ld.dataset.lossDays; return renderDates(); }
      var mv = e.target.closest('[data-exp-move]');
      if (mv) {
        var lot = (T.expiry.list() || []).filter(function (y) { return y.id === mv.closest('[data-exp]').dataset.exp; })[0];
        return lot && openMove(lot, mv.dataset.expMove);
      }
      var b = e.target.closest('[data-exp-done]');
      if (!b) return;
      var row = b.closest('[data-exp]');
      var x = (T.expiry.list() || []).filter(function (y) { return y.id === row.dataset.exp; })[0];
      if (!x) return;
      var st = b.dataset.expDone;
      if (st === 'supprime' && !confirm('Supprimer « ' + x.label + ' » ? (à utiliser seulement pour une saisie par erreur)')) return;
      b.disabled = true;
      T.expiry.close(x.id, st).then(function () {
        UI.toast('<strong>' + esc(x.label) + '</strong> ' + (st === 'utilise' ? 'utilisé' : st === 'jete' ? 'jeté' : 'supprimé'));
        renderDates();
      }, function (err) { b.disabled = false; UI.toast(esc(err.message), 5000); });
    });

    var stockView = $('#stockView');
    stockView.addEventListener('input', function (e) {
      if (e.target.id === 'stockSearch') { stockQ = e.target.value; renderStock(); }
    });
    stockView.addEventListener('click', function (e) {
      if (e.target.closest('[data-fc-run]')) return runForecast(($('#fcContext') || {}).value || '');
      if (e.target.closest('[data-scan-apply]')) return applyScan();
      if (e.target.closest('[data-dated-add]')) return addDated();
      if (e.target.closest('[data-dated-skip]')) { sc.dated = null; return renderStock(); }
      if (e.target.closest('[data-scan-cancel]')) { sc.result = null; sc.error = ''; return renderStock(); }
      var row = e.target.closest('[data-stock]');
      if (!row) return;
      var id = row.dataset.stock;
      var b = e.target.closest('[data-qty]');
      if (b) {
        var cur = T.getStock(id);
        return applyQty(id, Math.max(0, (cur || 0) + Number(b.dataset.qty)));
      }
      var set = e.target.closest('[data-qty-set]');
      if (set) return applyQty(id, set.dataset.qtySet);
    });
    stockView.addEventListener('change', function (e) {
      if (e.target.matches('[data-scan-file]')) { runScan(e.target.files); e.target.value = ''; return; }
      var dl = e.target.closest('[data-dated]');
      if (dl && sc.dated) {
        var dd = sc.dated[Number(dl.dataset.dated)];
        if (e.target.matches('[data-dated-on]')) dd.on = e.target.checked;
        if (e.target.matches('[data-dated-station]')) dd.station = e.target.value;
        return renderStock();
      }
      var sl = e.target.closest('[data-scan-line]');
      if (sl && sc.result) {
        var line = sc.result.lines[Number(sl.dataset.scanLine)];
        if (e.target.matches('[data-scan-on]')) line.on = e.target.checked;
        if (e.target.matches('[data-scan-item]')) { line.item_id = e.target.value || null; line.on = !!(line.item_id && line.quantity); }
        if (e.target.matches('[data-scan-qty]')) { var v = parseInt(e.target.value, 10); line.quantity = v > 0 ? Math.min(v, 100000) : null; line.on = !!(line.item_id && line.quantity); }
        return renderStock();
      }
      var row = e.target.closest('[data-stock]');
      if (!row) return;
      if (e.target.matches('[data-qty-input]')) applyQty(row.dataset.stock, e.target.value.trim());
      if (e.target.matches('[data-stock-avail]')) {
        var item = T.getItem(row.dataset.stock);
        T.setAvailable(row.dataset.stock, e.target.checked);
        UI.toast(e.target.checked
          ? '<strong>' + esc(item.name) + '</strong> de nouveau en vente'
          : '<strong>' + esc(item.name) + '</strong> en rupture · masqué du menu client');
      }
    });
    stockView.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('[data-qty-input], [data-scan-qty]')) e.target.blur();
      if (e.key === 'Enter' && e.target.id === 'fcContext' && !fc.running) runForecast(e.target.value);
    });

    var menuView = $('#menuView');
    menuView.addEventListener('input', function (e) {
      if (e.target.id === 'menuSearch') { state.q = e.target.value; renderMenuEditor(); }
    });
    menuView.addEventListener('change', function (e) {
      var row = e.target.closest('[data-item]');
      if (!row) return;
      var item = T.getItem(row.dataset.item);
      if (!item) return;
      if (e.target.matches('[data-price]')) {
        var p = parsePrice(e.target.value);
        if (p == null) { UI.toast('Prix invalide'); e.target.value = String(item.price).replace('.', ','); return; }
        item.price = p;
        T.saveItem(item);
        UI.toast('<strong>' + esc(item.name) + '</strong> · nouveau prix ' + fmt(p));
      }
      if (e.target.matches('[data-avail]')) {
        T.setAvailable(item.id, e.target.checked);
        UI.toast(e.target.checked
          ? '<strong>' + esc(item.name) + '</strong> de nouveau disponible'
          : '<strong>' + esc(item.name) + '</strong> en rupture · masqué du menu client');
      }
    });
    menuView.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('[data-price]')) e.target.blur();
    });
    menuView.addEventListener('click', function (e) {
      if (e.target.closest('[data-import-demo]')) {
        var d = window.TAPIGO_DEMO;
        T.replaceMenu({ categories: d.categories, tags: d.tags, items: d.items });
        return UI.toast('Carte de démonstration importée : adaptez-la à votre restaurant');
      }
      var nb = e.target.closest('[data-new]');
      if (nb) return openItemForm(null, nb.dataset.new || null);
      if (e.target.closest('[data-categories]')) return openCategories();
      if (e.target.closest('[data-settings]')) return openSettings();
      if (e.target.closest('[data-langs]')) return openLanguages();
      if (e.target.closest('[data-reset]')) {
        if (confirm('Réinitialiser le menu et les commandes de démonstration ?')) { T.resetDemo(); UI.toast('Données de démo restaurées'); }
        return;
      }
      var row = e.target.closest('[data-item]');
      if (!row) return;
      if (e.target.closest('[data-edit]')) openItemForm(row.dataset.item);
      if (e.target.closest('[data-delete]')) {
        var item = T.getItem(row.dataset.item);
        if (item && confirm('Supprimer « ' + item.name + ' » du menu ?')) {
          T.deleteItem(item.id);
          UI.toast('<strong>' + esc(item.name) + '</strong> supprimé');
        }
      }
    });

    /* Temps réel */
    T.subscribe(function (msg) {
      if (msg.type === 'order:created') announce(msg.payload);
      if (/^order:|^orders:|^demo:/.test(msg.type) && state.view === 'orders') renderOrders();
      if (/^order:|^orders:/.test(msg.type)) updateBadges();
      if ((msg.type === 'menu:updated' || msg.type === 'demo:reset') && state.view === 'menu') renderMenuEditor();
      if (msg.type === 'restaurant:updated' || msg.type === 'demo:reset') { renderBrand(); renderPause(); }
      if (msg.type === 'service:created') announceService(msg.payload);
      if (msg.type === 'servers:updated' && state.view === 'orders') renderOrders();
      if (msg.type === 'stock:updated' || msg.type === 'menu:updated' || msg.type === 'demo:reset') {
        updateStockBadge();
        if (state.view === 'stock' && !(document.activeElement && document.activeElement.matches('[data-qty-input]'))) renderStock();
        var p = msg.payload;
        if (msg.type === 'stock:updated' && p && !p.local && p.quantity === 0) {
          var it = T.getItem(p.id);
          if (it) UI.toast('⚠ <strong>' + esc(it.name) + '</strong> est épuisé', 5000);
        }
      }
      if (/^service:/.test(msg.type) && state.view === 'orders') renderOrders();
      if (msg.type === 'error') UI.toast('⚠ ' + esc(msg.payload.message), 5000);
      if (msg.type === 'expiry:updated') { updateDatesBadge(); if (state.view === 'dates') renderDates(); }
    });

    setInterval(tickTimers, 15000);
  }

  /* ======================================================================
     Démarrage & connexion (mode en ligne)
     ====================================================================== */
  var ROLE_LABEL = { admin: 'Admin Tapigo', owner: 'Gérant', equipe: 'Équipe' };
  var CHOICE_KEY = 'tapigo.v1.kitchen.restaurant';
  var myRestaurants = [];

  function start() {
    $('#simulateBtn').hidden = LIVE;
    $('#logoutBtn').hidden = !LIVE;
    if (LIVE) {
      var cur = T.currentRestaurant();
      // L'équipe ne gère que les commandes.
      document.querySelector('.k-tab[data-view="menu"]').hidden = cur.role === 'equipe';
      document.querySelector('.k-tab[data-view="stats"]').hidden = cur.role === 'equipe';
      document.querySelector('.k-tab[data-view="margins"]').hidden = cur.role === 'equipe';
      var sub = document.querySelector('.k-brand p');
      sub.textContent = ROLE_LABEL[cur.role] + ' · Cuisine & Bar';
      if (myRestaurants.length > 1) {
        sub.innerHTML = '<a href="#" id="switchRestaurant" style="color:inherit">' + esc(ROLE_LABEL[cur.role]) + ' · Changer de restaurant</a>';
        $('#switchRestaurant').addEventListener('click', function (e) {
          e.preventDefault();
          try { localStorage.removeItem(CHOICE_KEY); } catch (err) { /* ignore */ }
          location.href = location.pathname;
        });
      }
    }
    renderBrand();
    renderSound();
    renderPause();
    bind();
    updateStockBadge();
    updateDatesBadge();
    // Les échéances changent avec la date du jour (passage de minuit, tablette allumée toute la nuit).
    setInterval(function () { updateDatesBadge(); if (state.view === 'dates') renderDates(); }, 10 * 60000);
    // Pack HACCP : relevés et nettoyages en attente sur l'onglet.
    if (T.haccp && window.TapigoHaccp) {
      var haccpZone = function () { return { zone: myZone() }; };
      window.TapigoHaccp.badge(haccpZone());
      setInterval(function () { window.TapigoHaccp.badge(haccpZone()); }, 10 * 60000);
    }
    setView('orders');
    tickTimers();
    stripeReturn();
  }

  function showLogin(message) {
    var el = $('#login');
    el.hidden = false;
    var err = $('#loginError');
    err.hidden = !message;
    err.textContent = message || '';
    var btn = $('#loginBtn');
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }

  function enter(restaurant) {
    try { localStorage.setItem(CHOICE_KEY, restaurant.slug); } catch (e) { /* ignore */ }
    return T.startStaff(restaurant).then(function () {
      watchSuspension();
      $('#login').hidden = true;
      $('.kds').hidden = false;
      start();
    });
  }

  // Restaurant suspendu par Tapigo (impayé…) : l'équipe n'a plus accès, les admins Tapigo gardent la main.
  function suspended(r) { return r && r.active === false && r.role !== 'admin'; }

  function showSuspended(r, canSwitch) {
    var form = $('#loginForm');
    $('#login').hidden = false;
    $('.kds').hidden = true;
    var since = r.suspendedAt ? new Date(r.suspendedAt).toLocaleDateString('fr-FR') : '';
    form.innerHTML = '<div class="logo" aria-hidden="true">T</div><p class="eyebrow">' + esc(r.name) + '</p><h1>Accès suspendu</h1>' +
      '<p class="login__error">Le service Tapigo de ce restaurant est suspendu' + (since ? ' depuis le ' + esc(since) : '') + '.' +
        (r.suspendedReason ? '<br><strong>Motif :</strong> ' + esc(r.suspendedReason) : '') + '</p>' +
      '<p class="help">Les clients ne peuvent plus commander en ligne et le dashboard est indisponible. ' +
        'Contactez l’équipe Tapigo pour régulariser la situation : l’accès revient dès la réactivation, avec toutes vos données.</p>' +
      (canSwitch ? '<button class="btn btn--ghost btn--block" type="button" id="suspSwitch">Choisir un autre restaurant</button>' : '') +
      '<button class="link-btn" type="button" id="suspLogout">Se déconnecter</button>';
    form.onsubmit = function (e) { e.preventDefault(); };
    form.onclick = function (e) {
      if (e.target.closest('#suspSwitch')) {
        try { localStorage.removeItem(CHOICE_KEY); } catch (err) { /* ignore */ }
        location.href = location.pathname;
      }
      if (e.target.closest('#suspLogout')) {
        try { localStorage.removeItem(CHOICE_KEY); } catch (err) { /* ignore */ }
        T.auth.signOut().then(function () { location.reload(); });
      }
    };
  }

  // Suspension pendant le service : l'écran passe sur « Accès suspendu » sans attendre un rechargement.
  function watchSuspension() {
    setInterval(function () {
      var cur = T.currentRestaurant && T.currentRestaurant();
      if (!cur || cur.role === 'admin' || document.hidden) return;
      T.auth.myRestaurants().then(function (list) {
        var me = list.filter(function (r) { return r.id === cur.id; })[0];
        if (!me || suspended(me)) location.reload();
      }, function () { /* hors ligne : on réessaiera */ });
    }, 120000);
  }

  function showPicker(list) {
    var form = $('#loginForm');
    $('#login').hidden = false;
    form.innerHTML = '<div class="logo" aria-hidden="true">T</div><p class="eyebrow">Espace restaurateur</p><h1>Quel restaurant ?</h1>' +
      '<div class="order-list">' + list.map(function (r) {
        return '<button class="order-link" type="button" data-pick="' + esc(r.id) + '"><span><strong>' + esc(r.name) + '</strong><br>' +
          '<small style="color:var(--muted)">' + esc(r.slug) + (r.active ? '' : ' · suspendu') + '</small></span>' +
          '<span class="badge">' + esc(ROLE_LABEL[r.role] || r.role) + '</span></button>';
      }).join('') + '</div>' +
      '<button class="link-btn" type="button" id="pickerLogout">Se déconnecter</button>';
    form.onsubmit = function (e) { e.preventDefault(); };
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      var picked = b && list.filter(function (r) { return r.id === b.dataset.pick; })[0];
      if (picked && suspended(picked)) return showSuspended(picked, true);
      if (picked) enter(picked).catch(fatal);
      if (e.target.closest('#pickerLogout')) T.auth.signOut().then(function () { location.reload(); });
    });
  }

  function checkAccess() {
    return T.auth.myRestaurants().then(function (list) {
      myRestaurants = list;
      if (!list.length) {
        return T.auth.signOut().then(function () {
          showLogin('Ce compte n’est rattaché à aucun restaurant. Demandez l’accès à l’équipe Tapigo.');
        });
      }
      var wanted = new URLSearchParams(location.search).get('r');
      var saved = null;
      try { saved = localStorage.getItem(CHOICE_KEY); } catch (e) { /* ignore */ }
      var pick = function (slug) { return list.filter(function (r) { return r.slug === slug; })[0]; };
      var choice = (wanted && pick(wanted)) || (list.length === 1 ? list[0] : (saved && pick(saved)));
      if (choice && suspended(choice)) return showSuspended(choice, list.length > 1);
      if (choice) return enter(choice);
      showPicker(list);
    });
  }

  function fatal(err) {
    $('#login').hidden = false;
    $('#loginForm').innerHTML = '<div class="logo" aria-hidden="true">T</div><h1>Connexion impossible</h1><p class="login__error">' + esc(err.message) + '</p>' +
      '<button class="btn btn--primary btn--block" type="button" onclick="location.reload()">Réessayer</button>';
  }

  function openAccount() {
    UI.openAccount({
      onSwitch: myRestaurants.length > 1 ? function () {
        try { localStorage.removeItem(CHOICE_KEY); } catch (err) { /* ignore */ }
        location.href = location.pathname;
      } : null,
      onLogout: function () {
        try { localStorage.removeItem(CHOICE_KEY); } catch (err) { /* ignore */ }
      }
    });
  }

  function boot() {
    if (!LIVE) { $('#login').hidden = true; $('.kds').hidden = false; return start(); }

    $('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target.elements;
      var btn = $('#loginBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Connexion…';
      T.auth.signIn(f.email.value.trim(), f.password.value)
        .then(checkAccess)
        .catch(function (err) { showLogin(err.message); });
    });
    $('#logoutBtn').addEventListener('click', openAccount);

    return T.auth.session().then(function (session) {
      if (session) return checkAccess();
      showLogin();
    });
  }

  T.ready.then(boot).catch(fatal);
})();
