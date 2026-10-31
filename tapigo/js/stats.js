/* ==========================================================================
   Tapigo — Statistiques du restaurant
   Chiffre d'affaires, affluence, plats les plus vendus, temps de préparation,
   export CSV. Graphiques SVG sans dépendance, une seule teinte (--chart).
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc, fmt = T.fmt;
  var DAY = 24 * 3600 * 1000;
  var WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function compactEuro(v) {
    if (v >= 1000) return (Math.round(v / 100) / 10).toString().replace('.', ',') + ' k€';
    return Math.round(v) + ' €';
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  /* ---------------- Calculs ---------------- */
  function compute(orders, days) {
    var now = Date.now();
    var start = new Date(now - (days - 1) * DAY); start.setHours(0, 0, 0, 0);
    var byDay = {};
    for (var t = start.getTime(); t <= now; t += DAY) byDay[dayKey(t)] = { ts: t, revenue: 0, orders: 0 };
    var byHour = []; for (var h = 0; h < 24; h++) byHour.push({ hour: h, orders: 0, revenue: 0 });
    var items = {}, stations = { cuisine: 0, bar: 0 }, tables = {};
    var revenue = 0, count = 0, qty = 0, prep = [], byStaff = 0, tips = 0, tipped = 0;

    orders.forEach(function (o) {
      if (o.createdAt < start.getTime()) return;
      revenue += o.total; count++;
      if (o.tip) { tips += o.tip; tipped++; }
      if (o.source === 'serveur') byStaff++;
      var k = dayKey(o.createdAt);
      if (byDay[k]) { byDay[k].revenue += o.total; byDay[k].orders++; }
      var hr = new Date(o.createdAt).getHours();
      byHour[hr].orders++; byHour[hr].revenue += o.total;
      tables[o.table] = (tables[o.table] || 0) + o.total;
      o.lines.forEach(function (l) {
        qty += l.qty;
        var it = items[l.name] || (items[l.name] = { name: l.name, qty: 0, revenue: 0 });
        it.qty += l.qty; it.revenue += l.unitPrice * l.qty;
        stations[l.station === 'bar' ? 'bar' : 'cuisine'] += l.unitPrice * l.qty;
      });
      var h0 = (o.history || []).filter(function (x) { return x.status === 'nouvelle'; })[0];
      var h1 = (o.history || []).filter(function (x) { return x.status === 'prete'; })[0];
      if (h0 && h1 && h1.at > h0.at) prep.push((h1.at - h0.at) / 60000);
    });

    prep.sort(function (a, b) { return a - b; });
    return {
      revenue: revenue, count: count, qty: qty, byStaff: byStaff, tips: tips, tipped: tipped,
      basket: count ? revenue / count : 0,
      prepMedian: prep.length ? prep[Math.floor(prep.length / 2)] : null,
      days: Object.keys(byDay).sort().map(function (k) { return byDay[k]; }),
      hours: byHour,
      items: Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.qty - a.qty || b.revenue - a.revenue; }),
      stations: stations,
      tables: Object.keys(tables).map(function (k) { return { table: k, revenue: tables[k] }; }).sort(function (a, b) { return b.revenue - a.revenue; })
    };
  }

  /* ---------------- Bilan du mois ---------------- */
  var MIN_PER_ORDER = 2; // estimation : minutes de serveur gagnées par commande passée par le client lui-même
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function monthStart(offset) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() - offset); return d; }

  // Totaux d'une période [from, to[.
  function period(orders, from, to) {
    var p = { revenue: 0, count: 0, self: 0, sugRevenue: 0, sugQty: 0, tips: 0, online: 0, onlineRevenue: 0, items: {}, days: {}, hours: [] };
    for (var h = 0; h < 24; h++) p.hours.push(0);
    orders.forEach(function (o) {
      if (o.createdAt < from || o.createdAt >= to) return;
      p.revenue += o.total; p.count++;
      if (o.source !== 'serveur') p.self++;
      if (o.tip) p.tips += o.tip;
      if (o.payment && o.payment.method === 'online') { p.online++; p.onlineRevenue += o.total; }
      var k = dayKey(o.createdAt);
      p.days[k] = (p.days[k] || 0) + o.total;
      p.hours[new Date(o.createdAt).getHours()]++;
      o.lines.forEach(function (l) {
        var sq = Math.min(l.qty, Number(l.suggested) || 0);
        if (sq > 0) { p.sugQty += sq; p.sugRevenue += sq * l.unitPrice; }
        var it = p.items[l.name] || (p.items[l.name] = { name: l.name, qty: 0, revenue: 0 });
        it.qty += l.qty; it.revenue += l.unitPrice * l.qty;
      });
    });
    p.basket = p.count ? p.revenue / p.count : 0;
    p.top = Object.keys(p.items).map(function (k) { return p.items[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, 5);
    var bestDay = Object.keys(p.days).sort(function (a, b) { return p.days[b] - p.days[a]; })[0];
    p.bestDay = bestDay ? { day: bestDay, revenue: p.days[bestDay] } : null;
    var peak = p.hours.indexOf(Math.max.apply(null, p.hours));
    p.peak = p.count ? peak : null;
    p.openDays = Object.keys(p.days).length;
    p.minutesSaved = p.self * MIN_PER_ORDER;
    return p;
  }

  // Mois en cours : comparé à la même période du mois précédent (du 1er au même jour).
  // Mois terminé : comparé au mois entier d'avant.
  function bilan(orders, offset) {
    var from = monthStart(offset), next = monthStart(offset - 1);
    var to = offset === 0 ? Date.now() : next.getTime();
    var prevFrom = monthStart(offset + 1);
    var prevTo = offset === 0 ? Math.min(from.getTime(), new Date(prevFrom).setDate(new Date().getDate()) + DAY) : from.getTime();
    return {
      label: MONTHS[from.getMonth()] + ' ' + from.getFullYear(),
      prevLabel: MONTHS[prevFrom.getMonth()],
      running: offset === 0,
      cur: period(orders, from.getTime(), to),
      prev: period(orders, prevFrom.getTime(), prevTo)
    };
  }

  function evolution(cur, prev) {
    if (!prev) return '';
    var pct = Math.round((cur - prev) / prev * 100);
    return (pct > 0 ? '+' : '') + pct + ' %';
  }

  function hoursText(min) {
    if (min < 60) return Math.round(min) + ' min';
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '');
  }

  function dayLabel(k) {
    var d = new Date(k + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /* ---------------- Graphique en barres (SVG) ---------------- */
  // points : [{ label, value, tip }]
  function barChart(el, points, opts) {
    var W = Math.max(280, el.clientWidth || 600), H = opts.height || 220;
    var padL = 46, padR = 6, padT = 12, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = niceMax(Math.max.apply(null, points.map(function (p) { return p.value; }).concat([0])));
    var slot = plotW / points.length;
    var gap = Math.min(2, slot * 0.25);
    var bw = Math.max(1, slot - gap);
    var y = function (v) { return padT + plotH - (v / max) * plotH; };
    var every = Math.ceil(points.length / Math.max(2, Math.floor(plotW / 64)));

    var svg = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(opts.label) + '">';
    [0, 0.5, 1].forEach(function (f) {
      var v = max * f, yy = Math.round(y(v)) + 0.5;
      svg += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy + '" y2="' + yy + '" class="chart-grid"/>' +
        '<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" text-anchor="end" class="chart-axis">' + esc(opts.axis(v)) + '</text>';
    });
    points.forEach(function (p, i) {
      var x = padL + i * slot + gap / 2, h = Math.max(0, y(0) - y(p.value)), top = y(p.value);
      if (h > 0) {
        var r = Math.min(4, bw / 2, h);
        svg += '<path class="chart-bar" d="M' + x + ',' + (top + h) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (top + h) + 'Z"/>';
      }
      if (i % every === 0) {
        svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="chart-axis">' + esc(p.label) + '</text>';
      }
      svg += '<rect class="chart-hit" data-i="' + i + '" x="' + (padL + i * slot) + '" y="' + padT + '" width="' + slot + '" height="' + plotH + '"/>';
    });
    svg += '</svg>';
    el.innerHTML = svg + '<div class="chart-tip" hidden></div>';

    var tip = el.querySelector('.chart-tip');
    var show = function (e) {
      var hit = e.target.closest('.chart-hit');
      if (!hit) { tip.hidden = true; return; }
      var i = +hit.dataset.i, p = points[i];
      tip.innerHTML = p.tip;
      tip.hidden = false;
      var cx = padL + i * slot + slot / 2;
      tip.style.left = Math.min(Math.max(cx, 70), W - 70) + 'px';
      tip.style.top = Math.max(0, y(p.value) - 8) + 'px';
      el.querySelectorAll('.chart-bar.is-hover').forEach(function (b) { b.classList.remove('is-hover'); });
    };
    el.onpointermove = show;
    el.onpointerdown = show;
    el.onpointerleave = function () { tip.hidden = true; };
  }

  function tableHTML(head, rows) {
    return '<details class="chart-table"><summary>Voir les données</summary><div style="overflow-x:auto"><table><thead><tr>' +
      head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></details>';
  }

  /* ---------------- Export CSV ---------------- */
  function exportCSV(orders, name) {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['Numéro', 'Date', 'Heure', 'Table', 'Articles', 'Total (€)', 'Paiement', 'Statut']];
    orders.forEach(function (o) {
      var d = new Date(o.createdAt);
      rows.push([o.number, d.toLocaleDateString('fr-FR'), T.clock(o.createdAt), o.table,
        o.lines.map(function (l) { return l.qty + ' x ' + l.name; }).join(' / '),
        String(o.total.toFixed(2)).replace('.', ','),
        o.payment.status === 'paid' ? (o.payment.method === 'online' ? 'Payé en ligne' : 'Payé') : 'À encaisser', T.statusInfo(o.status).label]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(q).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tapigo-' + T._slug(name) + '-' + dayKey(Date.now()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------------- Rendu ---------------- */
  function render(root, opts) {
    var days = opts.days || 30;
    var monthOffset = 0;
    var orders = [];

    function shell(inner) {
      root.innerHTML = '<div class="stats">' +
        '<div class="stats__bar">' +
          '<div class="seg" role="group" aria-label="Période">' + [['bilan', 'Bilan du mois'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours']].map(function (p) {
            return '<button type="button" data-days="' + p[0] + '" aria-pressed="' + (days === p[0]) + '">' + p[1] + '</button>';
          }).join('') + '</div>' +
          (days === 'bilan' ? '<div class="seg" role="group" aria-label="Mois">' + [[0, 'Ce mois-ci'], [1, 'Mois dernier']].map(function (p) {
            return '<button type="button" data-month="' + p[0] + '" aria-pressed="' + (monthOffset === p[0]) + '">' + p[1] + '</button>';
          }).join('') + '</div>' : '') +
          '<div class="k-top__spacer"></div>' +
          (opts.compta ? '<button class="btn btn--ghost btn--sm" type="button" data-compta>📒 Export comptable</button>' : '') +
          (days === 'bilan' ? '<button class="btn btn--primary btn--sm" type="button" data-print-bilan>🖨 Imprimer / PDF</button>'
            : '<button class="btn btn--ghost btn--sm" type="button" data-export>⬇ Export CSV</button>') +
          (opts.demoTools ? '<button class="btn btn--soft btn--sm" type="button" data-seed>Générer 30 jours de démo</button>' +
            '<button class="btn btn--danger btn--sm" type="button" data-clear>Supprimer la démo</button>' : '') +
        '</div>' + inner + '</div>';
    }

    function paintBilan() {
      var b = bilan(orders, monthOffset), c = b.cur, p = b.prev;
      if (!c.count) {
        shell('<div class="empty"><h3>Pas encore de commandes en ' + esc(b.label) + '</h3><p>Le bilan se remplit automatiquement au fil des services.</p></div>');
        return;
      }
      var vs = b.running ? 'vs même période de ' + b.prevLabel : 'vs ' + b.prevLabel;
      var evo = function (cur, prev) { var e = evolution(cur, prev); return e ? e + ' ' + vs : 'pas de comparaison possible'; };
      var share = c.revenue ? Math.round(c.sugRevenue / c.revenue * 100) : 0;
      shell(
        '<section class="bilan">' +
          '<div class="bilan__hero">' +
            '<p class="eyebrow">Bilan · ' + esc(b.label) + (b.running ? ' (en cours)' : '') + '</p>' +
            '<h2>Ce que Tapigo vous a rapporté</h2>' +
            '<div class="bilan__big">' +
              '<div><b>' + fmt(c.sugRevenue) + '</b><span>de ventes en plus grâce aux suggestions « Parfait avec »' +
                (c.sugQty ? ' · ' + c.sugQty + ' article' + (c.sugQty > 1 ? 's' : '') + ' ajouté' + (c.sugQty > 1 ? 's' : '') + ' en un geste' + (share ? ', ' + share + ' % du chiffre d’affaires' : '') : '') + '</span></div>' +
              '<div><b>' + hoursText(c.minutesSaved) + '</b><span>de service gagné : ' + c.self + ' commande' + (c.self > 1 ? 's' : '') + ' passée' + (c.self > 1 ? 's' : '') + ' par les clients eux-mêmes (estimation : ' + MIN_PER_ORDER + ' min par commande)</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="stat-tiles">' +
            tile('Chiffre d’affaires via Tapigo', fmt(c.revenue), evo(c.revenue, p.revenue)) +
            tile('Commandes', c.count.toLocaleString('fr-FR'), evo(c.count, p.count)) +
            tile('Panier moyen', fmt(c.basket), evo(c.basket, p.basket)) +
            tile('Payées en ligne', c.online ? fmt(c.onlineRevenue) : '—', c.online ? c.online + ' commande' + (c.online > 1 ? 's' : '') + ' encaissée' + (c.online > 1 ? 's' : '') + ' sans terminal' : 'paiement en ligne non utilisé') +
            (c.tips ? tile('Pourboires pour l’équipe', fmt(c.tips), 'laissés avec le paiement en ligne') : '') +
          '</div>' +
          '<div class="stats-grid">' +
            '<section class="chart-card"><h3>Vos 5 meilleures ventes</h3><ol class="top-list">' + c.top.map(function (it) {
              return '<li><span class="top-list__name">' + esc(it.name) + '</span><span class="top-list__bar"><span style="width:' + Math.max(2, it.revenue / c.top[0].revenue * 100) + '%"></span></span>' +
                '<span class="top-list__val">' + it.qty + ' · ' + fmt(it.revenue) + '</span></li>';
            }).join('') + '</ol></section>' +
            '<section class="chart-card"><h3>Repères du mois</h3><ul class="bilan__facts">' +
              (c.bestDay ? '<li><span>Meilleure journée</span><strong>' + esc(dayLabel(c.bestDay.day)) + ' · ' + fmt(c.bestDay.revenue) + '</strong></li>' : '') +
              (c.peak != null ? '<li><span>Heure de pointe</span><strong>' + c.peak + 'h – ' + (c.peak + 1) + 'h</strong></li>' : '') +
              '<li><span>Jours avec des commandes</span><strong>' + c.openDays + '</strong></li>' +
              '<li><span>Commandes prises en salle par un serveur</span><strong>' + (c.count - c.self) + '</strong></li>' +
            '</ul></section>' +
          '</div>' +
          '<p class="help">Ventes en plus : articles ajoutés depuis une suggestion « Parfait avec » de la carte (comptées à partir du 28/10/2026). ' +
            'Service gagné : estimation à ' + MIN_PER_ORDER + ' minutes de serveur par commande passée directement par le client.</p>' +
        '</section>'
      );
    }

    function printBilan() {
      var view = root.querySelector('.bilan');
      if (!view) return;
      var w = window.open('', '_blank');
      if (!w) return UI.toast('Autorisez les fenêtres pour imprimer le bilan');
      // Styles recopiés tels quels (la fenêtre d'impression n'a pas d'adresse propre).
      var css = '<style>' + Array.prototype.map.call(document.styleSheets, function (sh) {
        try { return Array.prototype.map.call(sh.cssRules, function (r) { return r.cssText; }).join('\n'); } catch (err) { return ''; }
      }).join('\n') + '</style>';
      w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bilan Tapigo · ' + esc(opts.restaurantName || '') + '</title>' + css +
        '<style>body{background:#fff;padding:24px}.bilan{max-width:900px;margin:0 auto}@media print{body{padding:0}}</style></head><body>' +
        '<p class="eyebrow" style="text-align:center;margin-bottom:12px">' + esc(opts.restaurantName || '') + '</p>' + view.outerHTML + '</body></html>');
      w.document.close();
      w.onload = function () { w.focus(); w.print(); };
    }

    function paint() {
      if (days === 'bilan') return paintBilan();
      var s = compute(orders, days);
      if (!s.count) {
        shell('<div class="empty"><h3>Pas encore de commandes sur la période</h3><p>Les statistiques se remplissent automatiquement au fil des services.' +
          (opts.demoTools ? ' Pour une présentation, générez 30 jours de données fictives.' : '') + '</p></div>');
        return;
      }
      var top = s.items.slice(0, 8);
      var topMax = top.length ? top[0].qty : 1;
      var stTotal = s.stations.cuisine + s.stations.bar || 1;
      var hours = s.hours.filter(function (h) { return h.hour >= 10 && h.hour <= 23; });

      shell(
        '<div class="stat-tiles">' +
          tile('Chiffre d’affaires', fmt(s.revenue), days + ' derniers jours') +
          tile('Commandes', s.count.toLocaleString('fr-FR'), (Math.round(s.count / days * 10) / 10).toLocaleString('fr-FR') + ' par jour en moyenne') +
          tile('Panier moyen', fmt(s.basket), 'par commande') +
          tile('Préparation', s.prepMedian == null ? '—' : Math.round(s.prepMedian) + ' min', 'temps médian, de la commande à « Prête »') +
          tile('Articles vendus', s.qty.toLocaleString('fr-FR'), (Math.round(s.qty / s.count * 10) / 10).toLocaleString('fr-FR') + ' par commande') +
        '</div>' +
        '<section class="chart-card"><h3>Chiffre d’affaires par jour</h3><div class="chart" id="chartDays"></div>' +
          tableHTML(['Jour', 'Chiffre d’affaires', 'Commandes'], s.days.map(function (d) {
            return [new Date(d.ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }), fmt(d.revenue), d.orders];
          })) + '</section>' +
        '<div class="stats-grid">' +
          '<section class="chart-card"><h3>Affluence par heure</h3><div class="chart" id="chartHours"></div>' +
            tableHTML(['Heure', 'Commandes', 'Chiffre d’affaires'], hours.map(function (h) { return [h.hour + 'h', h.orders, fmt(h.revenue)]; })) + '</section>' +
          '<section class="chart-card"><h3>Plats les plus vendus</h3><ol class="top-list">' +
            top.map(function (it) {
              return '<li><span class="top-list__name">' + esc(it.name) + '</span>' +
                '<span class="top-list__bar"><span style="width:' + Math.max(2, it.qty / topMax * 100) + '%"></span></span>' +
                '<span class="top-list__val">' + it.qty + ' · ' + fmt(it.revenue) + '</span></li>';
            }).join('') + '</ol></section>' +
        '</div>' +
        '<div class="stat-tiles stat-tiles--small">' +
          tile('Cuisine', Math.round(s.stations.cuisine / stTotal * 100) + ' %', fmt(s.stations.cuisine) + ' de ventes') +
          tile('Bar', Math.round(s.stations.bar / stTotal * 100) + ' %', fmt(s.stations.bar) + ' de ventes') +
          tile('Prises en salle', Math.round(s.byStaff / s.count * 100) + ' %', s.byStaff + ' par un serveur · ' + (s.count - s.byStaff) + ' via la plaque NFC') +
          tile('Table la plus active', s.tables[0] ? 'Table ' + esc(s.tables[0].table) : '—', s.tables[0] ? fmt(s.tables[0].revenue) : '') +
          tile('Meilleur jour', bestDay(s.days), '') +
          (s.tips ? tile('Pourboires', fmt(s.tips), s.tipped + ' commande' + (s.tipped > 1 ? 's' : '') + ' payée' + (s.tipped > 1 ? 's' : '') + ' en ligne · hors chiffre d’affaires') : '') +
        '</div>'
      );

      barChart(root.querySelector('#chartDays'), s.days.map(function (d) {
        var dt = new Date(d.ts);
        return {
          label: days <= 7 ? WEEKDAYS[dt.getDay()] + ' ' + dt.getDate() : dt.getDate() + '/' + (dt.getMonth() + 1),
          value: d.revenue,
          tip: '<strong>' + esc(dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) + '</strong><br>' +
            fmt(d.revenue) + ' · ' + d.orders + ' commande' + (d.orders > 1 ? 's' : '')
        };
      }), { label: 'Chiffre d’affaires par jour', axis: compactEuro });

      barChart(root.querySelector('#chartHours'), hours.map(function (h) {
        return {
          label: h.hour + 'h', value: h.orders,
          tip: '<strong>' + h.hour + 'h – ' + (h.hour + 1) + 'h</strong><br>' + h.orders + ' commande' + (h.orders > 1 ? 's' : '') + ' · ' + fmt(h.revenue)
        };
      }), { label: 'Commandes par heure', axis: function (v) { return String(Math.round(v)); }, height: 200 });
    }

    function bestDay(list) {
      var b = list.slice().sort(function (a, c) { return c.revenue - a.revenue; })[0];
      return b && b.revenue ? esc(new Date(b.ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + fmt(b.revenue) : '—';
    }

    function tile(label, value, sub) {
      return '<div class="stat-tile"><span>' + esc(label) + '</span><b>' + value + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    }

    function load() {
      shell('<div class="empty"><span class="spinner" style="display:inline-block;border-color:var(--line);border-top-color:var(--ink)"></span><p style="margin-top:10px">Calcul des statistiques…</p></div>');
      // Bilan : mois en cours, mois dernier et celui d'avant (comparaison).
      var span = days === 'bilan' ? Math.ceil((Date.now() - monthStart(2).getTime()) / DAY) + 1 : days;
      opts.load(span).then(function (list) { orders = list; paint(); })
        .catch(function (err) { shell('<div class="empty"><h3>Statistiques indisponibles</h3><p>' + esc(err.message) + '</p></div>'); });
    }

    root.onclick = function (e) {
      var b = e.target.closest('[data-days]');
      if (b) { days = b.dataset.days === 'bilan' ? 'bilan' : +b.dataset.days; return load(); }
      var mo = e.target.closest('[data-month]');
      if (mo) { monthOffset = +mo.dataset.month; return paint(); }
      if (e.target.closest('[data-print-bilan]')) return printBilan();
      if (e.target.closest('[data-compta]')) return opts.compta();
      if (e.target.closest('[data-export]')) {
        if (!orders.length) return UI.toast('Aucune commande sur la période');
        return exportCSV(orders, opts.restaurantName || 'restaurant');
      }
      if (e.target.closest('[data-seed]')) {
        if (!confirm('Générer 30 jours de commandes fictives pour la démonstration ? Elles sont marquées « démo » et supprimables.')) return;
        e.target.disabled = true;
        return opts.seed().then(function (n) { UI.toast((n || 'Des') + ' commandes de démo générées'); load(); })
          .catch(function (err) { e.target.disabled = false; UI.toast(esc(err.message), 5000); });
      }
      if (e.target.closest('[data-clear]')) {
        if (!confirm('Supprimer toutes les commandes de démonstration ?')) return;
        return opts.clear().then(function () { UI.toast('Données de démo supprimées'); load(); })
          .catch(function (err) { UI.toast(esc(err.message), 5000); });
      }
    };

    var resizeTimer;
    window.onresize = function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (orders.length && !root.hidden) paint(); }, 200);
    };

    load();
  }

  window.TapigoStats = { render: render, compute: compute };
})();
