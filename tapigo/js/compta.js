/* ==========================================================================
   Tapigo — Export comptable (gérant)
   Ventes d'une période ventilées par taux de TVA et par moyen d'encaissement,
   pour l'expert-comptable : synthèse imprimable, journal des ventes, récap par
   jour et écritures comptables (CSV compatible tableur et logiciels comptables).
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc, fmt = T.fmt;
  var DAY = 24 * 3600 * 1000;
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // Moyens d'encaissement, dans l'ordre d'affichage.
  var MODES = [
    { id: 'cash', label: 'Espèces' },
    { id: 'card', label: 'Carte bancaire (au serveur)' },
    { id: 'mixed', label: 'Espèces + carte (à ventiler)' },
    { id: 'online', label: 'Paiement en ligne (Stripe)' },
    { id: 'pending', label: 'Non encaissé à ce jour' }
  ];

  // Plan comptable par défaut (modifiable par le gérant ou son comptable).
  var ACCOUNTS = [
    { id: 'sales10', label: 'Ventes TVA 10 %', def: '706100' },
    { id: 'sales20', label: 'Ventes TVA 20 %', def: '706200' },
    { id: 'vat10', label: 'TVA collectée 10 %', def: '445710' },
    { id: 'vat20', label: 'TVA collectée 20 %', def: '445720' },
    { id: 'cash', label: 'Caisse espèces', def: '530000' },
    { id: 'card', label: 'Cartes bancaires à encaisser', def: '511200' },
    { id: 'mixed', label: 'Attente : espèces + carte à ventiler', def: '471000' },
    { id: 'online', label: 'Paiements en ligne à encaisser (Stripe)', def: '511300' },
    { id: 'pending', label: 'Clients : ventes non encaissées', def: '411000' },
    { id: 'tips', label: 'Pourboires à reverser à l’équipe', def: '467000' }
  ];

  function r2(v) { return Math.round(v * 100) / 100; }
  function num(v) { return r2(v).toFixed(2).replace('.', ','); }
  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function frDate(k) { var p = k.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

  // Taux de TVA d'une ligne : celui figé à la vente, sinon d'après la carte actuelle.
  function lineVat(l) {
    if (l.vat === 10 || l.vat === 20) return l.vat;
    var it = l.itemId && T.getItem(l.itemId);
    if (it && it.alcohol === true) return 20;
    if (it && it.alcohol === false) return 10;
    return (l.station || (it && it.station)) === 'bar' ? 20 : 10;
  }

  function modeOf(o) {
    var p = o.payment || {};
    if (p.status !== 'paid') return 'pending';
    if (p.method !== 'onsite') return 'online';
    return p.with === 'cash' || p.with === 'card' || p.with === 'mixed' ? p.with : 'card';
  }

  function blank() {
    var b = { ttc: 0, ht: 0, vat: 0, count: 0, tips: 0, offered: 0, rates: {}, modes: {} };
    [10, 20].forEach(function (r) { b.rates[r] = { ttc: 0, ht: 0, vat: 0 }; });
    MODES.forEach(function (m) { b.modes[m.id] = 0; });
    return b;
  }

  // TVA calculée par taux sur le total TTC (et non ligne par ligne) pour éviter les écarts d'arrondi.
  function close(b) {
    b.ht = 0; b.vat = 0;
    [10, 20].forEach(function (r) {
      var x = b.rates[r];
      x.ttc = r2(x.ttc); x.ht = r2(x.ttc / (1 + r / 100)); x.vat = r2(x.ttc - x.ht);
      b.ht += x.ht; b.vat += x.vat;
    });
    b.ttc = r2(b.ttc); b.ht = r2(b.ht); b.vat = r2(b.vat); b.tips = r2(b.tips); b.offered = r2(b.offered);
    MODES.forEach(function (m) { b.modes[m.id] = r2(b.modes[m.id]); });
    return b;
  }

  function build(orders, from, to, skipDemo) {
    var total = blank(), days = {}, list = [], demo = 0;
    orders.forEach(function (o) {
      if (o.createdAt < from || o.createdAt >= to) return;
      if (skipDemo && o.payment && o.payment.demo) { demo++; return; }
      var k = dayKey(o.createdAt), d = days[k] || (days[k] = blank());
      var mode = modeOf(o), row = { o: o, mode: mode, rates: { 10: 0, 20: 0 }, offered: 0 };
      o.lines.forEach(function (l) {
        var amt = (Number(l.unitPrice) || 0) * l.qty, r = lineVat(l);
        row.rates[r] += amt;
        if (l.reward) row.offered += (Number(l.discount) || 0) * l.qty;
      });
      // Le total payé fait foi : un éventuel écart d'arrondi va sur le taux principal.
      var sum = row.rates[10] + row.rates[20], gap = o.total - sum;
      if (Math.abs(gap) > 0.001) row.rates[row.rates[20] > row.rates[10] ? 20 : 10] += gap;
      [total, d].forEach(function (b) {
        b.count++; b.ttc += o.total; b.tips += o.tip || 0; b.offered += row.offered;
        b.modes[mode] += o.total + (o.tip || 0);
        [10, 20].forEach(function (r) { b.rates[r].ttc += row.rates[r]; });
      });
      list.push(row);
    });
    Object.keys(days).forEach(function (k) { close(days[k]); });
    return { total: close(total), days: days, list: list, demo: demo };
  }

  /* ---------------- Fichiers ---------------- */
  function download(name, rows) {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var csv = '﻿' + rows.map(function (r) { return r.map(q).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function journalRows(res) {
    var rows = [['Date', 'Heure', 'N° commande', 'Table', 'Total TTC', 'HT 10 %', 'TVA 10 %', 'HT 20 %', 'TVA 20 %', 'Pourboire', 'Encaissement', 'Offert fidélité (TTC)', 'Détail']];
    res.list.forEach(function (x) {
      var o = x.o, h10 = r2(x.rates[10] / 1.1), h20 = r2(x.rates[20] / 1.2);
      rows.push([frDate(dayKey(o.createdAt)), T.clock(o.createdAt), o.number, o.table, num(o.total),
        num(h10), num(x.rates[10] - h10), num(h20), num(x.rates[20] - h20), num(o.tip || 0),
        MODES.filter(function (m) { return m.id === x.mode; })[0].label, x.offered ? num(x.offered) : '',
        o.lines.map(function (l) { return l.qty + ' x ' + l.name + (l.reward ? ' (offert)' : ''); }).join(' / ')]);
    });
    return rows;
  }

  function dayRows(res) {
    var rows = [['Date', 'Commandes', 'Total TTC', 'HT 10 %', 'TVA 10 %', 'HT 20 %', 'TVA 20 %', 'Total HT', 'Total TVA']
      .concat(MODES.map(function (m) { return m.label; }), ['dont pourboires', 'Offert fidélité (TTC)'])];
    var line = function (label, b) {
      return [label, b.count, num(b.ttc), num(b.rates[10].ht), num(b.rates[10].vat), num(b.rates[20].ht), num(b.rates[20].vat), num(b.ht), num(b.vat)]
        .concat(MODES.map(function (m) { return num(b.modes[m.id]); }), [num(b.tips), num(b.offered)]);
    };
    Object.keys(res.days).sort().forEach(function (k) { rows.push(line(frDate(k), res.days[k])); });
    rows.push(line('TOTAL', res.total));
    return rows;
  }

  // Écritures du journal des ventes : une pièce par jour, équilibrée (débit = crédit).
  function entryRows(res, acc, journal) {
    var rows = [['Date', 'Journal', 'Compte', 'Libellé', 'Pièce', 'Débit', 'Crédit']];
    Object.keys(res.days).sort().forEach(function (k) {
      var b = res.days[k], ref = 'Z' + k.replace(/-/g, ''), lab = 'Ventes du ' + frDate(k), date = frDate(k);
      var push = function (a, l, d, c) { if (Math.abs(d) > 0.001 || Math.abs(c) > 0.001) rows.push([date, journal, acc[a], l, ref, d ? num(d) : '', c ? num(c) : '']); };
      MODES.forEach(function (m) { push(m.id, lab + ' · ' + m.label, b.modes[m.id], 0); });
      [10, 20].forEach(function (r) {
        push('sales' + r, lab + ' · HT ' + r + ' %', 0, b.rates[r].ht);
        push('vat' + r, lab + ' · TVA ' + r + ' %', 0, b.rates[r].vat);
      });
      push('tips', lab + ' · pourboires', 0, b.tips);
    });
    return rows;
  }

  /* ---------------- Synthèse ---------------- */
  function summaryHTML(res, label) {
    var t = res.total;
    var row = function (a, b, strong) { return '<tr' + (strong ? ' class="cp-strong"' : '') + '><td>' + a + '</td><td>' + b + '</td></tr>'; };
    return '<div class="cp-sum">' +
      '<div class="cp-kpis"><div><b>' + fmt(t.ttc) + '</b><span>Chiffre d’affaires TTC</span></div>' +
        '<div><b>' + fmt(t.ht) + '</b><span>Chiffre d’affaires HT</span></div>' +
        '<div><b>' + fmt(t.vat) + '</b><span>TVA collectée</span></div>' +
        '<div><b>' + t.count + '</b><span>commandes</span></div></div>' +
      '<div class="cp-cols">' +
        '<table class="cp-table"><thead><tr><th>TVA</th><th>Montant</th></tr></thead><tbody>' +
          [10, 20].map(function (r) {
            var x = t.rates[r];
            return row('Ventes à ' + r + ' % · TTC', fmt(x.ttc)) + row('dont HT', fmt(x.ht)) + row('dont TVA ' + r + ' %', fmt(x.vat));
          }).join('') + row('Total TTC', fmt(t.ttc), true) + '</tbody></table>' +
        '<table class="cp-table"><thead><tr><th>Encaissements</th><th>Montant</th></tr></thead><tbody>' +
          MODES.map(function (m) { return row(m.label, fmt(t.modes[m.id])); }).join('') +
          row('Total encaissé ou à encaisser', fmt(t.ttc + t.tips), true) +
          (t.tips ? row('dont pourboires (à reverser, hors chiffre d’affaires)', fmt(t.tips)) : '') +
        '</tbody></table>' +
      '</div>' +
      (t.offered ? '<p class="help">Produits offerts avec la fidélité : ' + fmt(t.offered) + ' TTC (déjà déduits du chiffre d’affaires).</p>' : '') +
      (t.modes.mixed ? '<p class="help">« Espèces + carte » : la répartition exacte n’est pas connue de Tapigo ; à ventiler avec le ticket du terminal de paiement.</p>' : '') +
      (t.modes.pending ? '<p class="help">« Non encaissé » : commandes pas encore marquées payées au moment de l’export.</p>' : '') +
      (res.demo ? '<p class="help">' + res.demo + ' commande' + (res.demo > 1 ? 's' : '') + ' de démonstration exclue' + (res.demo > 1 ? 's' : '') + '.</p>' : '') +
      '</div>';
  }

  function printSummary(res, label, name) {
    var w = window.open('', '_blank');
    if (!w) return UI.toast('Autorisez les fenêtres pour imprimer');
    var css = '<style>' + Array.prototype.map.call(document.styleSheets, function (sh) {
      try { return Array.prototype.map.call(sh.cssRules, function (r) { return r.cssText; }).join('\n'); } catch (err) { return ''; }
    }).join('\n') + '</style>';
    var days = Object.keys(res.days).sort();
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Synthèse comptable · ' + esc(name) + ' · ' + esc(label) + '</title>' + css +
      '<style>body{background:#fff;padding:24px}.cp-print{max-width:900px;margin:0 auto}@media print{body{padding:0}}</style></head><body><div class="cp-print">' +
      '<p class="eyebrow">' + esc(name) + '</p><h1 style="font-size:28px;margin:4px 0 2px">Synthèse des ventes</h1><p class="help" style="margin-bottom:16px">' + esc(label) +
      ' · éditée le ' + new Date().toLocaleDateString('fr-FR') + ' avec Tapigo</p>' + summaryHTML(res, label) +
      '<h2 style="font-size:18px;margin:22px 0 8px">Détail par jour</h2><table class="cp-table cp-table--days"><thead><tr><th>Jour</th><th>Cdes</th><th>TTC</th><th>HT 10 %</th><th>TVA 10 %</th><th>HT 20 %</th><th>TVA 20 %</th><th>Espèces</th><th>Carte</th><th>En ligne</th></tr></thead><tbody>' +
      days.map(function (k) {
        var b = res.days[k];
        return '<tr><td>' + frDate(k) + '</td><td>' + b.count + '</td><td>' + num(b.ttc) + '</td><td>' + num(b.rates[10].ht) + '</td><td>' + num(b.rates[10].vat) +
          '</td><td>' + num(b.rates[20].ht) + '</td><td>' + num(b.rates[20].vat) + '</td><td>' + num(b.modes.cash) + '</td><td>' + num(b.modes.card + b.modes.mixed) + '</td><td>' + num(b.modes.online) + '</td></tr>';
      }).join('') + '</tbody></table></div></body></html>');
    w.document.close();
    w.onload = function () { w.focus(); w.print(); };
  }

  /* ---------------- Fenêtre ---------------- */
  function monthRange(offset) {
    var a = new Date(); a.setHours(0, 0, 0, 0); a.setDate(1); a.setMonth(a.getMonth() - offset);
    var b = new Date(a); b.setMonth(b.getMonth() + 1);
    return { from: a.getTime(), to: b.getTime(), label: MONTHS[a.getMonth()].charAt(0).toUpperCase() + MONTHS[a.getMonth()].slice(1) + ' ' + a.getFullYear() };
  }
  function inputDate(ts) { return dayKey(ts); }

  function open(opts) {
    var r = T.getRestaurant(), saved = r.accounting || {};
    var acc = {}; ACCOUNTS.forEach(function (a) { acc[a.id] = saved[a.id] || a.def; });
    var journal = saved.journal || 'VE';
    var sel = 1, range = monthRange(1), orders = null, res = null, loadedSpan = 0;
    var name = r.name || 'restaurant';

    UI.openSheet({
      label: 'Export comptable',
      head: '<p class="eyebrow">Pour votre expert-comptable</p><h2>Export comptable</h2>',
      body:
        '<div class="cp-bar"><div class="seg" role="group" aria-label="Période">' +
          [[1, 'Mois dernier'], [0, 'Ce mois-ci'], ['custom', 'Autre période']].map(function (p) {
            return '<button type="button" data-cp-range="' + p[0] + '" aria-pressed="' + (sel === p[0]) + '">' + p[1] + '</button>';
          }).join('') + '</div>' +
          '<div class="cp-custom" hidden><label class="field"><span>Du</span><input type="date" id="cpFrom"></label>' +
          '<label class="field"><span>Au (inclus)</span><input type="date" id="cpTo"></label></div></div>' +
        '<div id="cpBody"><p class="help"><span class="spinner"></span> Calcul…</p></div>' +
        '<details class="cp-acc"><summary>Numéros de comptes (plan comptable)</summary>' +
          '<p class="help">Proposés par défaut selon le plan comptable général. Votre expert-comptable peut vous donner les siens : ils sont gardés pour les prochains exports.</p>' +
          '<div class="cp-acc__grid"><label class="field"><span>Code journal</span><input id="cpJournal" maxlength="6" value="' + esc(journal) + '"></label>' +
          ACCOUNTS.map(function (a) {
            return '<label class="field"><span>' + esc(a.label) + '</span><input data-acc="' + a.id + '" maxlength="12" inputmode="numeric" value="' + esc(acc[a.id]) + '"></label>';
          }).join('') + '</div>' +
          '<button class="btn btn--soft btn--sm" type="button" data-cp-save-acc>Enregistrer les comptes</button></details>',
      footer:
        '<div class="cp-files"><button class="btn btn--ghost" type="button" data-cp-file="print">🖨 Synthèse PDF</button>' +
        '<button class="btn btn--ghost" type="button" data-cp-file="journal">Journal des ventes</button>' +
        '<button class="btn btn--ghost" type="button" data-cp-file="days">Récap par jour</button>' +
        '<button class="btn btn--primary" type="button" data-cp-file="entries">Écritures comptables</button></div>',
      onMount: function (sheet) {
        var body = $('#cpBody', sheet), from = $('#cpFrom', sheet), to = $('#cpTo', sheet);
        from.value = inputDate(range.from); to.value = inputDate(range.to - DAY);
        var paint = function () {
          res = build(orders, range.from, range.to, opts.live);
          body.innerHTML = '<p class="cp-period">' + esc(range.label) + '</p>' +
            (res.total.count ? summaryHTML(res, range.label) : '<div class="empty"><h3>Aucune vente sur cette période</h3><p>Choisissez une autre période.</p></div>');
        };
        var load = function () {
          var span = Math.ceil((Date.now() - range.from) / DAY) + 1;
          if (orders && span <= loadedSpan) return paint();
          body.innerHTML = '<p class="help"><span class="spinner"></span> Chargement des ventes…</p>';
          T.loadStats(span).then(function (list) { orders = list; loadedSpan = span; paint(); },
            function (err) { body.innerHTML = '<p class="help">' + esc(err.message) + '</p>'; });
        };
        var readAcc = function () {
          sheet.querySelectorAll('[data-acc]').forEach(function (i) { acc[i.dataset.acc] = i.value.trim() || ACCOUNTS.filter(function (a) { return a.id === i.dataset.acc; })[0].def; });
          journal = $('#cpJournal', sheet).value.trim() || 'VE';
        };
        var custom = function () {
          if (!from.value || !to.value) return;
          var a = new Date(from.value + 'T00:00:00').getTime(), b = new Date(to.value + 'T00:00:00').getTime() + DAY;
          if (b <= a) return; // en cours de saisie
          if (b - a > 400 * DAY) return UI.toast('Période de 13 mois maximum');
          range = { from: a, to: b, label: 'Du ' + frDate(from.value) + ' au ' + frDate(to.value) };
          load();
        };
        from.addEventListener('change', custom); to.addEventListener('change', custom);
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-cp-range]');
          if (b) {
            sel = b.dataset.cpRange === 'custom' ? 'custom' : +b.dataset.cpRange;
            sheet.querySelectorAll('[data-cp-range]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            $('.cp-custom', sheet).hidden = sel !== 'custom';
            if (sel === 'custom') return custom();
            range = monthRange(sel); return load();
          }
          if (e.target.closest('[data-cp-save-acc]')) {
            readAcc();
            var info = T.getRestaurant(); info.accounting = Object.assign({}, acc, { journal: journal });
            T.saveRestaurant(info); return UI.toast('Numéros de comptes enregistrés');
          }
          var f = e.target.closest('[data-cp-file]');
          if (!f) return;
          if (!res || !res.total.count) return UI.toast('Aucune vente sur la période');
          readAcc();
          var base = 'tapigo-' + T._slug(name) + '-' + dayKey(range.from) + '_' + dayKey(range.to - DAY);
          if (f.dataset.cpFile === 'print') return printSummary(res, range.label, name);
          if (f.dataset.cpFile === 'journal') return download(base + '-journal-ventes.csv', journalRows(res));
          if (f.dataset.cpFile === 'days') return download(base + '-recap-jours.csv', dayRows(res));
          download(base + '-ecritures.csv', entryRows(res, acc, journal));
        });
        load();
      }
    });
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  window.TapigoCompta = { open: open, build: build, entryRows: entryRows };
})();
