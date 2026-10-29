/* ==========================================================================
   Tapigo — Commandes fournisseurs (onglet Stocks)
   À partir du stock conseillé du jour (prévision), du stock réel et du
   conditionnement de chaque produit, Tapigo prépare un bon de commande par
   fournisseur, à envoyer par e-mail, WhatsApp, copier ou imprimer. Les
   fournisseurs sont appris à chaque bon de livraison scanné.
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc, I = UI.ICONS;
  var VIA = { email: 'envoyée par e-mail', whatsapp: 'envoyée par WhatsApp', copie: 'copiée', impression: 'imprimée', autre: '' };

  var state = { data: null, error: '', loading: false, opts: {}, el: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function int(v) { var n = parseInt(v, 10); return isFinite(n) ? n : null; }
  function dmy(ms) { return new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function supplier(id) { return (state.data.suppliers || []).filter(function (s) { return s.id === id; })[0]; }
  function restaurantName() { return (T.getRestaurant() || {}).name || ''; }

  // Portions déjà commandées et pas encore livrées (commandes « en attente »).
  function pending(itemId) {
    return state.data.orders.filter(function (o) { return o.status === 'envoyee'; }).reduce(function (n, o) {
      return n + o.lines.filter(function (l) { return l.itemId === itemId; }).reduce(function (m, l) { return m + l.qty * (l.packSize || 1); }, 0);
    }, 0);
  }

  // Proposition de commande d'un produit : quantité conseillée par jour × jours couverts − stock réel
  // − déjà commandé, arrondie au conditionnement supérieur.
  function proposal(item, prod, sup) {
    var adv = state.opts.advice ? state.opts.advice()[item.id] : null;
    var stock = T.getStock(item.id);
    if (!adv || stock == null) return null;
    var ordered = pending(item.id);
    var target = adv.quantity * sup.coverDays, need = target - stock - ordered;
    if (need <= 0) return null;
    var packs = Math.ceil(need / prod.packSize);
    return { item: item, prod: prod, qty: packs, stock: stock, ordered: ordered, perDay: adv.quantity, target: target, need: need };
  }

  // Par fournisseur : produits rattachés et propositions.
  function plan() {
    var items = T.getMenu().items, d = state.data;
    var bySup = {}, orphans = [];
    var adv = state.opts.advice ? state.opts.advice() : {};
    items.forEach(function (it) {
      var prod = d.products[it.id], sup = prod && supplier(prod.supplierId);
      if (!sup) {
        var st = T.getStock(it.id), a = adv[it.id];
        if (a && st != null && st < a.quantity) orphans.push(it);
        return;
      }
      var g = bySup[sup.id] = bySup[sup.id] || { sup: sup, items: [], todo: [] };
      g.items.push(it);
      var p = proposal(it, prod, sup);
      if (p) g.todo.push(p);
    });
    return { groups: d.suppliers.map(function (s) { return bySup[s.id] || { sup: s, items: [], todo: [] }; }), orphans: orphans };
  }

  function load() {
    state.loading = true;
    return T.suppliers.load().then(function (d) { state.data = d; state.error = ''; }, function (err) { state.error = err.message; })
      .then(function () { state.loading = false; paint(); });
  }

  /* ---------------- Bloc de l'onglet Stocks ---------------- */
  function paint() {
    var el = state.el;
    if (!el || !document.body.contains(el)) return;
    var head = '<div class="forecast__head"><div><p class="eyebrow">' + I.bolt.replace('<svg ', '<svg width="14" height="14" ') + ' Fournisseurs</p>' +
      '<h2>Commandes fournisseurs</h2></div>' +
      (state.opts.manager && state.data ? '<button class="btn btn--ghost btn--sm" type="button" data-sup-settings>Fournisseurs et conditionnements</button>' : '') + '</div>';
    if (state.error) { el.innerHTML = '<section class="forecast">' + head + '<p class="help">' + esc(state.error) + '</p></section>'; return; }
    if (!state.data) { el.innerHTML = '<section class="forecast">' + head + '<p class="help"><span class="spinner"></span> Chargement…</p></section>'; return; }

    var p = plan(), hasForecast = state.opts.hasForecast && state.opts.hasForecast();
    var open = state.data.orders.filter(function (o) { return o.status === 'envoyee'; });
    var body;
    if (!state.data.suppliers.length) {
      body = '<p class="forecast__summary">Scannez un bon de livraison : son fournisseur est enregistré tout seul et rattaché aux produits livrés. ' +
        (state.opts.manager ? 'Vous pouvez aussi ajouter vos fournisseurs dans « Fournisseurs et conditionnements ».' : 'Le gérant peut aussi les ajouter.') + '</p>';
    } else {
      body = (hasForecast ? '' : '<p class="forecast__summary"><strong>Calculez d’abord la prévision du jour</strong> (bloc « Prévision IA » ci-dessus) : les quantités à commander en dépendent.</p>') +
        '<div class="forecast__list">' + p.groups.map(function (g) {
          var n = g.todo.length;
          return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(g.sup.name) + '</strong><small>' +
            (n ? n + ' produit' + (n > 1 ? 's' : '') + ' à commander pour ' + g.sup.coverDays + ' jour' + (g.sup.coverDays > 1 ? 's' : '') + ' · ' +
                g.todo.map(function (x) { return esc(x.item.name); }).join(', ')
              : g.items.length ? 'Rien à commander : stock suffisant pour ' + g.sup.coverDays + ' jour' + (g.sup.coverDays > 1 ? 's' : '') : 'Aucun produit rattaché') +
            '</small></div>' +
            '<button class="btn ' + (n ? 'btn--primary' : 'btn--soft') + ' btn--sm" type="button" data-sup-order="' + esc(g.sup.id) + '"' + (g.items.length ? '' : ' disabled') + '>' +
              (n ? 'Préparer le bon' : 'Commande libre') + '</button></div>';
        }).join('') + '</div>' +
        (p.orphans.length ? '<p class="help">Sans fournisseur et en dessous du conseillé : ' + p.orphans.map(function (i) { return esc(i.name); }).join(', ') +
          (state.opts.manager ? ' · à rattacher dans « Fournisseurs et conditionnements ».' : '.') + '</p>' : '');
    }
    body += open.length ? '<p class="forecast__summary" style="margin-top:6px"><strong>En attente de livraison</strong></p><div class="forecast__list">' + open.slice(0, 6).map(function (o) {
      return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(o.supplierName) + '</strong><small>' + dmy(o.at) + (VIA[o.via] ? ' · ' + VIA[o.via] : '') + ' · ' +
          o.lines.map(function (l) { return l.qty + ' × ' + esc(l.name); }).join(', ') + '</small></div>' +
        '<div style="display:flex;gap:6px"><button class="btn btn--soft btn--sm" type="button" data-sup-close="' + esc(o.id) + '" data-status="recue">Reçue</button>' +
        '<button class="link-btn" type="button" data-sup-close="' + esc(o.id) + '" data-status="annulee">Annuler</button></div></div>';
    }).join('') + '</div>' : '';
    el.innerHTML = '<section class="forecast">' + head + body + '</section>';
  }

  /* ---------------- Bon de commande ---------------- */
  function orderText(sup, lines, note) {
    var name = restaurantName();
    return 'Bonjour,\n\nVoici la commande' + (name ? ' de ' + name : '') + ' :\n' +
      lines.map(function (l) {
        return '- ' + l.qty + ' × ' + (l.packLabel || 'unité') + ' · ' + l.name + (l.ref ? ' (réf. ' + l.ref + ')' : '');
      }).join('\n') +
      (note ? '\n\n' + note : '') + '\n\nMerci de nous confirmer la livraison.\n' + (name || '');
  }

  function openOrder(supId) {
    var g = plan().groups.filter(function (x) { return x.sup.id === supId; })[0];
    if (!g) return;
    var sup = g.sup;
    var lines = g.items.map(function (it) {
      var prod = state.data.products[it.id], p = g.todo.filter(function (x) { return x.item.id === it.id; })[0];
      return { itemId: it.id, name: it.name, qty: p ? p.qty : 0, packLabel: prod.packLabel, packSize: prod.packSize, ref: prod.ref, why: p };
    }).sort(function (a, b) { return b.qty - a.qty; });
    var note = '';

    function why(l) {
      var p = l.why;
      if (!p) return 'Stock ' + (T.getStock(l.itemId) == null ? 'illimité' : T.getStock(l.itemId)) + ' · rien de conseillé à commander';
      return 'Stock ' + p.stock + (p.ordered ? ' + ' + p.ordered + ' déjà commandés' : '') + ' · conseillé ' + p.perDay + ' par jour × ' + sup.coverDays + ' j = ' + p.target + ' · manque ' + p.need +
        (l.packSize > 1 ? ' → ' + p.qty + ' × ' + l.packSize : '');
    }
    function chosen() { return lines.filter(function (l) { return l.qty > 0; }); }
    function bodyHTML() {
      return '<div class="order-lines">' + lines.map(function (l, i) {
          return '<div class="order-line' + (l.qty ? '' : ' is-off') + '" data-ol="' + i + '">' +
            '<div><strong>' + esc(l.name) + '</strong><small>' + esc((l.packLabel || 'à l’unité') + (l.ref ? ' · réf. ' + l.ref : '')) + '</small><small class="order-line__why">' + esc(why(l)) + '</small></div>' +
            '<div class="qty-stepper"><button class="icon-btn" type="button" data-ol-minus aria-label="Moins">−</button>' +
              '<input type="number" min="0" max="99999" inputmode="numeric" value="' + l.qty + '" data-ol-qty aria-label="Quantité">' +
              '<button class="icon-btn" type="button" data-ol-plus aria-label="Plus">+</button></div></div>';
        }).join('') + '</div>' +
        '<label class="field" style="margin-top:12px"><span>Message (facultatif)</span><input data-ol-note maxlength="300" value="' + esc(note) + '" placeholder="Ex : livraison souhaitée mardi matin"></label>' +
        '<details class="order-preview"><summary>Voir le message</summary><pre>' + esc(orderText(sup, chosen(), note)) + '</pre></details>';
    }

    UI.openSheet({
      label: 'Bon de commande',
      head: '<p class="eyebrow">Bon de commande</p><h2>' + esc(sup.name) + '</h2>' +
        '<p class="help">Quantités calculées pour ' + sup.coverDays + ' jour' + (sup.coverDays > 1 ? 's' : '') + ' (jusqu’à la livraison suivante), à partir du stock conseillé et du stock réel. Ajustez si besoin.' +
        (sup.note ? ' · ' + esc(sup.note) : '') + '</p>',
      body: '<div id="orderBody">' + bodyHTML() + '</div>',
      footer: '<div class="order-send">' +
        (sup.email ? '<button class="btn btn--primary" type="button" data-send="email">Envoyer par e-mail</button>' : '') +
        '<button class="btn ' + (sup.email ? 'btn--soft' : 'btn--primary') + '" type="button" data-send="whatsapp">WhatsApp</button>' +
        '<button class="btn btn--soft" type="button" data-send="copie">Copier</button>' +
        '<button class="btn btn--soft" type="button" data-send="impression">Imprimer</button></div>',
      onMount: function (sheet) {
        var box = $('#orderBody', sheet);
        var repaint = function () { var open = box.querySelector('details') && box.querySelector('details').open; box.innerHTML = bodyHTML(); if (open) box.querySelector('details').open = true; };
        box.addEventListener('click', function (e) {
          var row = e.target.closest('[data-ol]');
          if (!row) return;
          var l = lines[+row.dataset.ol];
          if (e.target.closest('[data-ol-minus]')) { l.qty = Math.max(0, l.qty - 1); repaint(); }
          if (e.target.closest('[data-ol-plus]')) { l.qty = Math.min(99999, l.qty + 1); repaint(); }
        });
        box.addEventListener('change', function (e) {
          if (e.target.matches('[data-ol-qty]')) { lines[+e.target.closest('[data-ol]').dataset.ol].qty = Math.max(0, Math.min(99999, int(e.target.value) || 0)); repaint(); }
          if (e.target.matches('[data-ol-note]')) { note = e.target.value.trim(); repaint(); }
        });
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-send]');
          if (!b) return;
          var via = b.dataset.send, list = chosen();
          if (!list.length) return UI.toast('La commande est vide');
          var text = orderText(sup, list, note);
          // L'action part tout de suite (geste de l'utilisateur), l'enregistrement suit.
          if (via === 'email') {
            location.href = 'mailto:' + encodeURIComponent(sup.email) + '?subject=' + encodeURIComponent('Commande ' + restaurantName()) + '&body=' + encodeURIComponent(text);
          } else if (via === 'whatsapp') {
            var digits = String(sup.phone || '').replace(/[^0-9]/g, '').replace(/^0(?=[1-9])/, '33');
            window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(text), '_blank');
          } else if (via === 'copie') {
            copy(text);
          } else {
            printOrder(sup, list, note);
          }
          T.suppliers.recordOrder(sup.id, list.map(function (l) {
            return { itemId: l.itemId, name: l.name, qty: l.qty, packLabel: l.packLabel, packSize: l.packSize, ref: l.ref };
          }), note, via).then(function () {
            UI.closeSheet();
            UI.toast(via === 'copie' ? 'Commande copiée : collez-la dans votre message' : 'Commande notée · en attente de livraison', 3500);
            load();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function () { fallback(); });
    fallback();
    function fallback() {
      var t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      t.remove();
    }
  }

  function printOrder(sup, lines, note) {
    var w = window.open('', '_blank');
    if (!w) return UI.toast('Autorisez les fenêtres pour imprimer le bon');
    var name = restaurantName();
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de commande · ' + esc(sup.name) + '</title>' +
      '<style>body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1b18;margin:32px}h1{font-size:22px;margin:0 0 4px}.sub{color:#6b655c;margin:0 0 20px}' +
      'table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;color:#6b655c}' +
      'td.q{font-weight:700;width:70px}.note{margin-top:18px}@media print{body{margin:0}}</style></head><body>' +
      '<h1>Bon de commande</h1><p class="sub">' + esc(name) + ' → ' + esc(sup.name) + ' · ' + new Date().toLocaleDateString('fr-FR') + '</p>' +
      '<table><thead><tr><th>Quantité</th><th>Conditionnement</th><th>Produit</th><th>Référence</th></tr></thead><tbody>' +
      lines.map(function (l) {
        return '<tr><td class="q">' + l.qty + '</td><td>' + esc(l.packLabel || 'unité') + '</td><td>' + esc(l.name) + '</td><td>' + esc(l.ref || '') + '</td></tr>';
      }).join('') + '</tbody></table>' + (note ? '<p class="note">' + esc(note) + '</p>' : '') + '</body></html>');
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  }

  /* ---------------- Réglages (gérant) ---------------- */
  function openSettings() {
    var d = state.data;
    // Produits suivis en stock d'abord : ce sont eux que les commandes concernent.
    var items = T.getMenu().items.slice().sort(function (x, y) { return (T.getStock(x.id) == null) - (T.getStock(y.id) == null); });
    UI.openSheet({
      label: 'Fournisseurs',
      head: '<p class="eyebrow">Commandes fournisseurs</p><h2>Fournisseurs et conditionnements</h2>',
      body: '<div class="margins-head"><h3>Fournisseurs</h3><button class="btn btn--ghost btn--sm" type="button" data-sup-edit>+ Fournisseur</button></div>' +
        (d.suppliers.length ? '<table class="loss-table"><tbody>' + d.suppliers.map(function (s) {
          return '<tr><td><strong>' + esc(s.name) + '</strong><small class="margin-src">' +
            esc([s.email, s.phone, 'commande pour ' + s.coverDays + ' j'].filter(Boolean).join(' · ')) + '</small></td>' +
            '<td style="text-align:right"><button class="link-btn" type="button" data-sup-edit="' + esc(s.id) + '">Modifier</button></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="help">Aucun fournisseur. Ils s’ajoutent aussi tout seuls à chaque bon de livraison scanné.</p>') +
        '<h3 style="margin-top:20px">Produits</h3><p class="help">Pour chaque produit suivi en stock : son fournisseur, ce que vous commandez (ex. « carton de 6 ») et combien de portions cela fait.</p>' +
        '<div class="sup-products">' + items.map(function (it) {
          var p = d.products[it.id] || {};
          return '<div class="sup-product" data-sp="' + esc(it.id) + '"><strong>' + esc(it.name) + (T.getStock(it.id) == null ? ' <small class="margin-src">stock illimité</small>' : '') + '</strong>' +
            '<select data-sp-sup aria-label="Fournisseur"><option value="">— aucun —</option>' + d.suppliers.map(function (s) {
              return '<option value="' + esc(s.id) + '"' + (s.id === p.supplierId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
            }).join('') + '</select>' +
            '<input data-sp-label maxlength="40" value="' + esc(p.packLabel || '') + '" placeholder="Conditionnement" aria-label="Conditionnement"' + (p.supplierId ? '' : ' disabled') + '>' +
            '<label class="sup-product__size"><input data-sp-size type="number" min="1" max="10000" value="' + (p.packSize || 1) + '"' + (p.supplierId ? '' : ' disabled') + ' aria-label="Portions par conditionnement"><span>portions</span></label>' +
            '<input data-sp-ref maxlength="40" value="' + esc(p.ref || '') + '" placeholder="Réf." aria-label="Référence"' + (p.supplierId ? '' : ' disabled') + '></div>';
        }).join('') + '</div>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-sup-edit]');
          if (b) openSupplier(b.dataset.supEdit || null);
        });
        sheet.addEventListener('change', function (e) {
          var row = e.target.closest('[data-sp]');
          if (!row) return;
          var sup = $('[data-sp-sup]', row).value;
          row.querySelectorAll('input').forEach(function (x) { x.disabled = !sup; });
          var size = Math.max(1, Math.min(10000, int($('[data-sp-size]', row).value) || 1));
          T.suppliers.setProduct(row.dataset.sp, sup || null, size, $('[data-sp-label]', row).value.trim(), $('[data-sp-ref]', row).value.trim()).then(function () {
            if (sup) d.products[row.dataset.sp] = { supplierId: sup, packSize: size, packLabel: $('[data-sp-label]', row).value.trim(), ref: $('[data-sp-ref]', row).value.trim() };
            else delete d.products[row.dataset.sp];
            paint();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  function openSupplier(id) {
    var s = id ? supplier(id) : { name: '', email: '', phone: '', coverDays: 2, note: '' };
    UI.openSheet({
      label: 'Fournisseur',
      head: '<p class="eyebrow">Fournisseur</p><h2>' + (id ? esc(s.name) : 'Nouveau fournisseur') + '</h2>',
      body: '<form id="supForm" class="form-grid" novalidate>' +
        '<label class="field span-2"><span>Nom</span><input name="name" maxlength="80" value="' + esc(s.name) + '"></label>' +
        '<label class="field"><span>E-mail des commandes</span><input name="email" type="email" maxlength="120" value="' + esc(s.email) + '"></label>' +
        '<label class="field"><span>Téléphone (WhatsApp)</span><input name="phone" type="tel" maxlength="30" value="' + esc(s.phone) + '"></label>' +
        '<label class="field"><span>Une commande couvre</span><select name="cover">' + [1, 2, 3, 4, 5, 6, 7, 10, 14].map(function (n) {
          return '<option value="' + n + '"' + (n === s.coverDays ? ' selected' : '') + '>' + n + ' jour' + (n > 1 ? 's' : '') + '</option>';
        }).join('') + '</select><small class="help">Le temps jusqu’à la livraison suivante.</small></label>' +
        '<label class="field"><span>Note</span><input name="note" maxlength="200" value="' + esc(s.note) + '" placeholder="Ex : commande avant 18 h"></label>' +
      '</form>',
      footer: (id ? '<button class="btn btn--danger" type="button" id="supDelete">Supprimer</button>' : '') + '<button class="btn btn--primary" type="submit" form="supForm">Enregistrer</button>',
      onMount: function (sheet) {
        var form = $('#supForm', sheet), f = form.elements;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!f.name.value.trim()) return UI.toast('Indiquez le nom');
          T.suppliers.save({ id: id, name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), coverDays: int(f.cover.value), note: f.note.value.trim() })
            .then(function () { UI.toast('Fournisseur enregistré'); return load(); }, function (err) { UI.toast(esc(err.message), 5000); throw err; })
            .then(function () { openSettings(); }, function () {});
        });
        var del = $('#supDelete', sheet);
        if (del) del.addEventListener('click', function () {
          if (!confirm('Supprimer « ' + s.name + ' » ? Ses produits n’auront plus de fournisseur.')) return;
          T.suppliers.remove(id).then(function () { UI.toast('Fournisseur supprimé'); return load(); }).then(openSettings, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  /* ---------------- Montage ---------------- */
  // opts : { manager, advice() -> { itemId: { quantity } }, hasForecast() }
  function mount(el, opts) {
    state.opts = opts || {};
    state.el = el;
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('click', function (e) {
        var o = e.target.closest('[data-sup-order]');
        if (o) return openOrder(o.dataset.supOrder);
        if (e.target.closest('[data-sup-settings]')) return openSettings();
        var c = e.target.closest('[data-sup-close]');
        if (c) {
          return T.suppliers.closeOrder(c.dataset.supClose, c.dataset.status).then(function () {
            UI.toast(c.dataset.status === 'recue' ? 'Commande reçue · pensez à scanner le bon pour le stock' : 'Commande annulée', 3500);
            load();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        }
      });
    }
    if (!state.data && !state.loading && !state.error) load(); else paint();
  }

  // Après un bon scanné : fournisseur appris, liste rechargée.
  function learn(name, itemIds) {
    if (!T.suppliers || !String(name || '').trim()) return;
    T.suppliers.learn(name, itemIds).then(function () { state.data = null; state.error = ''; if (state.el && document.body.contains(state.el)) load(); }, function () {});
  }

  window.TapigoSuppliers = { mount: mount, learn: learn };
})();
