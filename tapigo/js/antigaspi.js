/* ==========================================================================
   Tapigo — Anti-gaspillage (onglet Dates)
   Les produits dont la date limite arrive aujourd'hui ou demain sont proposés
   au gérant : en un geste, il les met en avant sur la carte client (« À ne pas
   manquer aujourd'hui »), avec ou sans remise, jusqu'à ce soir ou jusqu'à leur
   date. Un ingrédient bientôt périmé remonte les plats qui l'utilisent (fiches
   techniques). Les ventes anti-gaspi sont comptées pour le gérant.
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc, fmt = T.fmt, I = UI.ICONS;
  var PCTS = [0, 10, 20, 30, 50];
  var state = { opts: {}, el: null, recipes: null, sales: null, salesAt: 0 };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function dayEnd(ymd) { var p = ymd.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59).toISOString(); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dateLabel(ymd) { var p = ymd.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function hm(iso) { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }

  // Plats à écouler : lots de la carte qui périment aujourd'hui ou demain, et plats dont
  // un ingrédient périme (fiches techniques, gérant). Une DLC dépassée n'est jamais proposée.
  function candidates() {
    var daysLeft = state.opts.daysLeft, list = (T.expiry && T.expiry.list()) || [], zone = state.opts.zone || 'all';
    var menu = T.getMenu().items.filter(function (i) { return i.available !== false && T.getStock(i.id) !== 0; });
    var byId = {}, out = {};
    menu.forEach(function (i) { byId[i.id] = i; });
    var add = function (item, lot, why) {
      var c = out[item.id] = out[item.id] || { item: item, date: lot.expiresOn, portions: 0, reasons: [] };
      if (lot.expiresOn < c.date) c.date = lot.expiresOn;
      if (lot.itemId === item.id && lot.portions) c.portions += lot.portions;
      if (c.reasons.indexOf(why) < 0) c.reasons.push(why);
    };
    list.filter(function (x) {
      var d = daysLeft(x.expiresOn);
      return x.status === 'actif' && d >= 0 && d <= 1 && (zone === 'all' || x.station === zone);
    }).forEach(function (lot) {
      if (lot.itemId && byId[lot.itemId]) return add(byId[lot.itemId], lot, (lot.kind === 'ddm' ? 'DDM ' : 'DLC ') + (lot.expiresOn === today() ? 'aujourd’hui' : 'demain'));
      if (!state.recipes) return;
      // Ingrédient : plats dont la fiche technique l'utilise.
      // Rapprochement par mots-clés : « Prosecco ouvert » ↔ « Prosecco DOC », « Citrons (citronnade) » ↔ « Citrons jaunes ».
      var words = function (s) { return norm(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4; }); };
      var lw = words(lot.label);
      var ings = state.recipes.ingredients.filter(function (g) { return words(g.name).some(function (w) { return lw.indexOf(w) >= 0; }); });
      if (!ings.length) return;
      var ids = ings.map(function (g) { return g.id; });
      Object.keys(state.recipes.recipes).forEach(function (itemId) {
        var r = state.recipes.recipes[itemId], item = byId[itemId];
        if (!item) return;
        var uses = (r.lines || []).some(function (l) { return ids.indexOf(l.ingredientId) >= 0; });
        if (uses) add(item, lot, lot.label + ' à utiliser ' + (lot.expiresOn === today() ? 'aujourd’hui' : 'demain'));
      });
    });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function paint() {
    var el = state.el;
    if (!el || !document.body.contains(el)) return;
    var manager = state.opts.manager;
    var active = T.getMenu().items.filter(function (i) { return T.promoOf(i); });
    var todo = candidates().filter(function (c) { return !T.promoOf(c.item); });
    var sold = state.sales;
    if (!active.length && !todo.length && !(sold && sold.qty)) { el.innerHTML = ''; return; }

    el.innerHTML = '<section class="forecast antigaspi">' +
      '<div class="forecast__head"><div><p class="eyebrow">' + I.bolt.replace('<svg ', '<svg width="14" height="14" ') + ' Anti-gaspillage</p>' +
        '<h2>À écouler en priorité</h2></div></div>' +
      (todo.length ? '<p class="forecast__summary">Ces produits arrivent à leur date limite. Mettez-les en avant sur la carte client, avec ou sans remise : ils partent avant d’être jetés.</p>' +
        '<div class="forecast__list">' + todo.map(function (c) {
          return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(c.item.name) + '</strong><small>' +
            esc(c.reasons.join(' · ')) + (c.portions ? ' · ' + c.portions + ' portion' + (c.portions > 1 ? 's' : '') + ' dans le lot' : '') + '</small></div>' +
            (manager ? '<button class="btn btn--primary btn--sm" type="button" data-ag-promo="' + esc(c.item.id) + '" data-date="' + esc(c.date) + '">Mettre en avant</button>'
              : '<span class="badge badge--warn">À proposer en priorité</span>') + '</div>';
        }).join('') + '</div>' : '') +
      (active.length ? '<p class="forecast__summary" style="margin-top:6px"><strong>En avant sur la carte client</strong></p><div class="forecast__list">' + active.map(function (i) {
          var p = T.promoOf(i);
          return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(i.name) + '</strong><small>' +
            (p.pct ? '−' + p.pct + ' % : ' + fmt(T.itemPrice(i)) + ' au lieu de ' + fmt(i.price) : 'Mise en avant, prix normal') +
            ' · jusqu’à ' + (new Date(p.until).toDateString() === new Date().toDateString() ? 'ce soir ' + hm(p.until) : esc(new Date(p.until).toLocaleDateString('fr-FR', { weekday: 'long' })) + ' soir') +
            '</small></div>' + (manager ? '<button class="btn btn--soft btn--sm" type="button" data-ag-stop="' + esc(i.id) + '">Arrêter</button>' : '') + '</div>';
        }).join('') + '</div>' : '') +
      (sold && sold.qty ? '<p class="help" style="margin-top:6px">30 derniers jours : <strong>' + sold.qty + ' portion' + (sold.qty > 1 ? 's' : '') + ' écoulée' + (sold.qty > 1 ? 's' : '') +
        ' grâce à l’anti-gaspi</strong> (' + fmt(sold.revenue) + ' de ventes au lieu de pertes).</p>' : '') +
    '</section>';
  }

  function openPromo(itemId, date) {
    var item = T.getItem(itemId);
    if (!item) return;
    var pct = 20, until = today();
    var later = date && date > today() ? date : null;
    function body() {
      var price = Math.round(item.price * (100 - pct)) / 100;
      return '<div class="field"><span>Remise</span><div class="tip-chips">' + PCTS.map(function (p) {
          return '<button type="button" class="tip-chip' + (p === pct ? ' is-on' : '') + '" data-pct="' + p + '"><b>' + (p ? '−' + p + ' %' : 'Sans remise') + '</b><small>' + fmt(Math.round(item.price * (100 - p)) / 100) + '</small></button>';
        }).join('') + '</div></div>' +
        '<div class="field" style="margin-top:12px"><span>Jusqu’à</span><div class="seg" role="group">' +
          '<button type="button" data-until="' + today() + '" aria-pressed="' + (until === today()) + '">Ce soir</button>' +
          (later ? '<button type="button" data-until="' + later + '" aria-pressed="' + (until === later) + '">' + esc(dateLabel(later)) + ' soir</button>' : '') +
        '</div></div>' +
        '<p class="help" style="margin-top:12px">Sur la carte client : en tête, rubrique « À ne pas manquer aujourd’hui », ' +
          (pct ? 'au prix de <strong>' + fmt(price) + '</strong> au lieu de ' + fmt(item.price) : 'avec la mention « Suggestion du chef », au prix normal') +
          '. Les options gardent leur prix. La mise en avant s’arrête toute seule à l’heure prévue.</p>';
    }
    UI.openSheet({
      label: 'Mettre en avant',
      head: '<p class="eyebrow">Anti-gaspillage</p><h2>' + esc(item.name) + '</h2>',
      body: '<div id="agBody">' + body() + '</div>',
      footer: '<button class="btn btn--primary" type="button" id="agSave">Mettre en avant sur la carte</button>',
      onMount: function (sheet) {
        var box = $('#agBody', sheet);
        box.addEventListener('click', function (e) {
          var p = e.target.closest('[data-pct]');
          if (p) { pct = +p.dataset.pct; box.innerHTML = body(); }
          var u = e.target.closest('[data-until]');
          if (u) { until = u.dataset.until; box.innerHTML = body(); }
        });
        $('#agSave', sheet).addEventListener('click', function () {
          var it = T.getItem(itemId);
          it.promo = { pct: pct, until: dayEnd(until) };
          T.saveItem(it);
          UI.closeSheet();
          UI.toast('<strong>' + esc(it.name) + '</strong> mis en avant sur la carte' + (pct ? ' à −' + pct + ' %' : ''));
          paint();
        });
      }
    });
  }

  function stop(itemId) {
    var it = T.getItem(itemId);
    if (!it) return;
    delete it.promo;
    T.saveItem(it);
    UI.toast('Mise en avant arrêtée');
    paint();
  }

  function loadExtras() {
    // Fiches techniques (gérant) : relier un ingrédient qui périme aux plats qui l'utilisent.
    if (state.opts.manager && T.margins && !state.recipes) {
      T.margins.load().then(function (d) { state.recipes = d; paint(); }, function () { state.recipes = { ingredients: [], recipes: {} }; });
    }
    // Ventes anti-gaspi des 30 derniers jours (rechargées toutes les 5 minutes au plus).
    if (state.opts.manager && Date.now() - state.salesAt > 5 * 60000) {
      state.salesAt = Date.now();
      T.loadStats(30).then(function (orders) {
        var qty = 0, revenue = 0;
        orders.forEach(function (o) { (o.lines || []).forEach(function (l) { if (l.antigaspi) { qty += l.qty; revenue += l.unitPrice * l.qty; } }); });
        state.sales = { qty: qty, revenue: revenue };
        paint();
      }, function () {});
    }
  }

  // opts : { manager, zone, daysLeft(ymd) -> jours restants }
  function mount(el, opts) {
    state.opts = opts || {};
    state.el = el;
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('click', function (e) {
        var p = e.target.closest('[data-ag-promo]');
        if (p) return openPromo(p.dataset.agPromo, p.dataset.date);
        var s = e.target.closest('[data-ag-stop]');
        if (s) return stop(s.dataset.agStop);
      });
    }
    paint();
    loadExtras();
  }

  window.TapigoAntigaspi = { mount: mount };
})();
