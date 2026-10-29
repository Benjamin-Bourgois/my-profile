/* ==========================================================================
   Tapigo — Pack HACCP (onglet HACCP)
   Relevés de température des enceintes froides (matin et soir), plan de
   nettoyage, contrôle des livraisons à réception et registre imprimable pour
   un contrôle sanitaire. L'équipe saisit pour son poste, avec ses initiales ;
   le gérant règle les appareils et les tâches.
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc;
  var BY_KEY = 'tapigo.v1.haccp.by';
  var STATION = { cuisine: 'Cuisine', bar: 'Bar' };
  var FREQ = { jour: 'Chaque jour', semaine: 'Chaque semaine', mois: 'Chaque mois' };
  var KIND = { positif: 'Froid positif (frigo, chambre froide)', negatif: 'Froid négatif (congélateur)', autre: 'Autre (vitrine, maintien au chaud…)' };
  var TEMP_ACTIONS = ['Porte refermée, recontrôle dans 1 h', 'Produits transférés dans un autre frigo', 'Thermostat réglé', 'Technicien appelé', 'Produits jetés'];
  var RECEPTION_ACTIONS = ['Livraison refusée', 'Produit refusé, avoir demandé', 'Accepté sous réserve, fournisseur prévenu'];
  var EVENING = 14; // à partir de 14 h, on attend le relevé du soir

  var state = { data: null, error: '', opts: {} };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace('−', '-')); return isFinite(n) ? n : null; }
  function deg(t) { return t == null ? '—' : String(t).replace('.', ',').replace('-', '−') + ' °C'; }
  function hm(ms) { return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function day(ms) { return new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function dmy(ms) { return new Date(ms).toLocaleDateString('fr-FR'); }
  function by() { try { return localStorage.getItem(BY_KEY) || ''; } catch (e) { return ''; } }
  function setBy(v) { try { localStorage.setItem(BY_KEY, v); } catch (e) { /* ignore */ } }

  function limits(e) {
    if (e.min != null && e.max != null) return deg(e.min).replace(' °C', '') + ' à ' + deg(e.max);
    return e.max != null ? '≤ ' + deg(e.max) : '≥ ' + deg(e.min);
  }

  // Débuts de période : demi-journée en cours, jour, semaine (lundi), mois.
  function starts(now) {
    var d = new Date(now); d.setHours(0, 0, 0, 0);
    var today = d.getTime();
    var slot = new Date(now).getHours() >= EVENING ? today + EVENING * 3600000 : today;
    var monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    var month = new Date(d); month.setDate(1);
    return { today: today, slot: slot, evening: slot !== today, jour: today, semaine: monday.getTime(), mois: month.getTime() };
  }

  function zoneOk(station) { var z = state.opts.zone || 'all'; return z === 'all' || z === station; }

  // Ce qui reste à faire maintenant : relevés de la demi-journée, tâches de la période.
  function todo(d, now) {
    var s = starts(now || Date.now());
    var eq = d.equipment.filter(function (e) { return e.active && zoneOk(e.station); });
    var tasks = d.tasks.filter(function (t) { return t.active && zoneOk(t.station); });
    var lastReading = function (e) { return d.readings.filter(function (r) { return r.equipmentId === e.id; })[0]; };
    var lastClean = function (t) { return d.cleanings.filter(function (c) { return c.taskId === t.id; })[0]; };
    return {
      s: s, eq: eq, tasks: tasks, lastReading: lastReading, lastClean: lastClean,
      temps: eq.filter(function (e) { var r = lastReading(e); return !r || r.at < s.slot; }),
      cleans: tasks.filter(function (t) { var c = lastClean(t); return !c || c.at < s[t.frequency]; })
    };
  }

  function since() {
    var s = starts(Date.now());
    return Math.min(s.mois, Date.now() - 8 * 86400000);
  }

  function load() {
    return T.haccp.load(since()).then(function (d) { state.data = d; state.error = ''; return d; },
      function (err) { state.error = err.message; throw err; });
  }

  // Pastille de l'onglet : nombre de relevés et de tâches en attente.
  function badge(opts) {
    var el = document.getElementById('haccpCount');
    if (!el || !T.haccp) return;
    if (opts) state.opts = Object.assign({}, state.opts, opts);
    T.haccp.load(since()).then(function (d) {
      var t = todo(d);
      var n = t.temps.length + t.cleans.length;
      el.hidden = !n; el.textContent = n;
    }, function () { el.hidden = true; });
  }

  /* ---------------- Page ---------------- */
  function render(root) {
    if (state.error) { root.innerHTML = '<div class="empty"><h3>HACCP indisponible</h3><p>' + esc(state.error) + '</p></div>'; return; }
    if (!state.data) { root.innerHTML = '<div class="empty"><p>Chargement…</p></div>'; return; }
    var d = state.data, t = todo(d), manager = state.opts.manager;
    var week = Date.now() - 7 * 86400000;

    if (!t.eq.length && !t.tasks.length) {
      root.innerHTML = '<div class="empty"><h3>Pack HACCP</h3><p>Relevés de température, plan de nettoyage et contrôle des livraisons, prêts pour un contrôle sanitaire.</p>' +
        (manager
          ? '<p style="margin-top:16px"><button class="btn btn--primary" type="button" data-h-seed>Créer le plan type</button></p>' +
            '<p class="help" style="margin-top:8px">Un réfrigérateur et un congélateur en cuisine, un réfrigérateur au bar, et les tâches de nettoyage courantes. Tout se modifie ensuite dans « Réglages ».</p>'
          : '<p style="margin-top:12px">Le gérant doit d’abord régler les appareils et le plan de nettoyage.</p>') + '</div>';
      return;
    }

    var nonconf = d.readings.filter(function (r) { return !r.ok && r.at >= week && zoneOk(r.station); }).length +
      d.receptions.filter(function (r) { return !r.ok && r.at >= week && zoneOk(r.station); }).length;
    var readToday = t.eq.filter(function (e) { var r = t.lastReading(e); return r && r.at >= t.s.slot; }).length;

    var stationTag = function (st) { return (state.opts.zone || 'all') === 'all' ? ' · ' + STATION[st] : ''; };

    var tempCards = t.eq.map(function (e) {
      var r = t.lastReading(e), due = !r || r.at < t.s.slot;
      var today = d.readings.filter(function (x) { return x.equipmentId === e.id && x.at >= t.s.today; });
      return '<div class="date-row haccp-row' + (r && !r.ok ? ' date-row--late' : due ? ' date-row--soon' : '') + '">' +
        '<div class="date-row__when"><b>' + (r ? deg(r.temp) : '—') + '</b><small>' + (r ? (r.ok ? 'conforme' : 'hors limites') + ' · ' + (r.at >= t.s.today ? hm(r.at) : day(r.at)) : 'jamais relevé') + '</small></div>' +
        '<div class="date-row__name"><strong>' + esc(e.name) + '</strong><span>' + limits(e) + stationTag(e.station) +
          (today.length ? ' · aujourd’hui : ' + today.slice().reverse().map(function (x) { return hm(x.at) + ' ' + deg(x.temp) + ' (' + esc(x.by) + ')'; }).join(', ') : '') + '</span>' +
          (r && !r.ok && r.action ? '<span>Action : ' + esc(r.action) + '</span>' : '') + '</div>' +
        '<div class="date-row__actions"><button class="btn ' + (due ? 'btn--primary' : 'btn--soft') + ' btn--sm" type="button" data-h-temp="' + esc(e.id) + '">' +
          (due ? 'Relever (' + (t.s.evening ? 'soir' : 'matin') + ')' : 'Nouveau relevé') + '</button></div></div>';
    }).join('');

    var cleanGroups = ['jour', 'semaine', 'mois'].map(function (f) {
      var list = t.tasks.filter(function (x) { return x.frequency === f; });
      if (!list.length) return '';
      return '<p class="recipe-opts__group">' + FREQ[f] + '</p>' + list.map(function (x) {
        var c = t.lastClean(x), done = c && c.at >= t.s[f];
        return '<div class="haccp-task' + (done ? ' is-done' : '') + '">' +
          '<button class="haccp-task__check" type="button" data-h-clean="' + esc(x.id) + '"' + (done ? ' disabled aria-label="Fait"' : ' aria-label="Marquer fait"') + '>' + (done ? '✓' : '') + '</button>' +
          '<div><strong>' + esc(x.label) + '</strong><small>' + (done ? 'Fait par ' + esc(c.by) + ' · ' + (c.at >= t.s.today ? 'aujourd’hui ' + hm(c.at) : day(c.at)) :
            c ? 'Dernière fois : ' + day(c.at) + ' (' + esc(c.by) + ')' : 'Jamais fait') + stationTag(x.station) + '</small></div></div>';
      }).join('');
    }).join('');

    var receptions = d.receptions.filter(function (r) { return r.at >= week && zoneOk(r.station); });

    root.innerHTML = '<div class="editor haccp">' +
      '<div class="stat-tiles stat-tiles--small">' +
        tile('À faire maintenant', String(t.temps.length + t.cleans.length), t.temps.length + ' relevé' + (t.temps.length > 1 ? 's' : '') + ', ' + t.cleans.length + ' nettoyage' + (t.cleans.length > 1 ? 's' : '')) +
        tile('Températures ' + (t.s.evening ? 'du soir' : 'du matin'), readToday + ' / ' + t.eq.length, readToday === t.eq.length ? 'tout est relevé' : 'à relever') +
        tile('Non-conformités', String(nonconf), 'sur les 7 derniers jours') +
      '</div>' +
      '<div class="haccp-actions">' +
        '<button class="btn btn--soft btn--sm" type="button" data-h-reception>Contrôler une livraison</button>' +
        '<button class="link-btn" type="button" data-h-by>' + (by() ? 'Initiales : ' + esc(by()) + ' · changer' : 'Indiquer mes initiales') + '</button>' +
        (manager ? '<button class="btn btn--soft btn--sm" type="button" data-h-register>Registre à imprimer</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-h-settings>Réglages</button>' : '') +
      '</div>' +
      (t.eq.length ? '<section><h2 class="haccp-title">Températures</h2><p class="help">Deux relevés par jour : le matin à l’ouverture et le soir (à partir de ' + EVENING + ' h). Repères : froid positif 0 à 4 °C, congélateur −18 °C ou moins.</p>' +
        '<div class="date-list">' + tempCards + '</div></section>' : '') +
      (t.tasks.length ? '<section class="chart-card"><h3>Plan de nettoyage</h3>' + cleanGroups + '</section>' : '') +
      '<section class="chart-card"><h3>Livraisons contrôlées (7 jours)</h3>' + (receptions.length
        ? '<div style="overflow-x:auto"><table class="loss-table"><thead><tr><th>Date</th><th>Fournisseur</th><th>Produits</th><th>T°</th><th>Résultat</th><th>Par</th></tr></thead><tbody>' +
            receptions.map(function (r) {
              return '<tr><td>' + day(r.at) + ' ' + hm(r.at) + '</td><td>' + esc(r.supplier || '—') + '</td><td>' + esc(r.product) + '</td><td>' + deg(r.temp) + '</td>' +
                '<td>' + (r.ok ? '<span class="badge badge--ok">Conforme</span>' : '<span class="badge badge--danger">Non conforme</span><small class="margin-src">' + esc(r.action) + '</small>') + '</td><td>' + esc(r.by) + '</td></tr>';
            }).join('') + '</tbody></table></div>'
        : '<p class="help">À chaque livraison : température des produits frais (4 °C maximum) et surgelés (−18 °C), emballages intacts, dates limites, propreté du camion.</p>') +
      '</section>' +
    '</div>';
  }

  function tile(label, value, sub) {
    return '<div class="stat-tile"><span>' + esc(label) + '</span><b>' + value + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  function refresh() {
    return load().then(function () { rerender(); badge(); }, function () { rerender(); });
  }

  /* ---------------- Saisies de l'équipe ---------------- */
  function byField() {
    return '<label class="field"><span>Vos initiales</span><input name="by" maxlength="40" autocomplete="off" value="' + esc(by()) + '" placeholder="Ex : LM" required></label>';
  }

  // Champ température avec bouton ± (le clavier numérique des téléphones n'a pas toujours le signe moins).
  function tempField(name, label, value) {
    return '<div class="field"><span>' + label + '</span><div class="temp-input">' +
      '<button class="btn btn--soft" type="button" data-sign aria-label="Changer le signe">±</button>' +
      '<input name="' + name + '" type="text" inputmode="decimal" autocomplete="off" value="' + (value == null ? '' : value) + '" placeholder="Ex : 3,5">' +
      '<b>°C</b></div></div>';
  }

  function chipsHTML(list) {
    return '<div class="tip-chips onsite-chips loss-reasons">' + list.map(function (a) {
      return '<button type="button" class="tip-chip" data-chip="' + esc(a) + '"><b>' + esc(a) + '</b></button>';
    }).join('') + '</div>';
  }

  function wireCommon(sheet, form) {
    sheet.addEventListener('click', function (e) {
      var s = e.target.closest('[data-sign]');
      if (s) {
        var input = s.parentNode.querySelector('input');
        var v = input.value.trim();
        input.value = v.charAt(0) === '-' || v.charAt(0) === '−' ? v.slice(1) : '-' + v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.focus();
      }
      var c = e.target.closest('[data-chip]');
      if (c) {
        form.elements.action.value = c.dataset.chip;
        sheet.querySelectorAll('[data-chip]').forEach(function (b) { b.classList.toggle('is-on', b === c); });
      }
    });
  }

  function openTemp(id) {
    var e = state.data.equipment.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    UI.openSheet({
      label: 'Relevé de température',
      head: '<p class="eyebrow">Relevé de température</p><h2>' + esc(e.name) + '</h2><p class="help">Limites : ' + limits(e) + '</p>',
      body: '<form id="tempForm" class="form-grid" novalidate>' + tempField('temp', 'Température affichée') + byField() +
        '<div class="span-2" id="tempAlert" hidden><p class="haccp-alert">Hors limites : indiquez ce que vous avez fait.</p>' + chipsHTML(TEMP_ACTIONS) +
          '<label class="field" style="margin-top:8px"><span>Action corrective</span><textarea name="action" maxlength="200" rows="2"></textarea></label></div>' +
        '</form>',
      footer: '<button class="btn btn--primary" type="submit" form="tempForm">Enregistrer le relevé</button>',
      onMount: function (sheet) {
        var form = $('#tempForm', sheet), alert = $('#tempAlert', sheet);
        wireCommon(sheet, form);
        var check = function () {
          var t = num(form.elements.temp.value);
          alert.hidden = t == null || ((e.min == null || t >= e.min) && (e.max == null || t <= e.max));
        };
        form.elements.temp.addEventListener('input', check);
        setTimeout(function () { form.elements.temp.focus(); }, 50);
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var t = num(form.elements.temp.value), who = form.elements.by.value.trim();
          if (t == null) return UI.toast('Indiquez la température');
          if (!who) return UI.toast('Indiquez vos initiales');
          check();
          if (!alert.hidden && !form.elements.action.value.trim()) return UI.toast('Indiquez l’action corrective');
          setBy(who);
          T.haccp.recordTemp(e.id, t, alert.hidden ? '' : form.elements.action.value.trim(), who).then(function (r) {
            UI.closeSheet();
            UI.toast(r.ok ? 'Relevé enregistré · ' + deg(r.temp) : 'Relevé hors limites enregistré avec l’action corrective', r.ok ? 2600 : 4000);
            refresh();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  function markClean(id) {
    var who = by();
    var send = function (name) {
      T.haccp.markClean(id, '', name).then(function () { UI.toast('Nettoyage noté · ' + esc(name)); refresh(); }, function (err) { UI.toast(esc(err.message), 5000); });
    };
    if (who) return send(who);
    askBy(send);
  }

  // Initiales retenues sur la tablette (changées par chaque équipier au début de son service).
  function askBy(done) {
    UI.openSheet({
      label: 'Vos initiales',
      head: '<p class="eyebrow">Plan de nettoyage</p><h2>Qui l’a fait ?</h2>',
      body: '<form id="byForm" class="form-grid" novalidate>' + byField() + '<p class="help span-2">Retenues sur cette tablette pour les prochaines fois.</p></form>',
      footer: '<button class="btn btn--primary" type="submit" form="byForm">Valider</button>',
      onMount: function (sheet) {
        var form = $('#byForm', sheet);
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var name = form.elements.by.value.trim();
          if (!name) return UI.toast('Indiquez vos initiales');
          setBy(name); UI.closeSheet(); if (done) done(name); else rerender();
        });
      }
    });
  }

  function openReception() {
    var zone = state.opts.zone || 'all';
    UI.openSheet({
      label: 'Contrôle à réception',
      head: '<p class="eyebrow">Contrôle à réception</p><h2>Livraison</h2>' +
        '<p class="help">Vérifiez la température des produits frais (4 °C maximum) et surgelés (−18 °C), les emballages, les dates limites et la propreté du camion.</p>',
      body: '<form id="recForm" class="form-grid" novalidate>' +
        (zone === 'all' ? '<label class="field"><span>Poste</span><select name="station"><option value="cuisine">Cuisine</option><option value="bar">Bar</option></select></label>' : '') +
        '<label class="field"><span>Fournisseur</span><input name="supplier" maxlength="80" placeholder="Ex : DistriFrais"></label>' +
        '<label class="field span-2"><span>Produits contrôlés</span><input name="product" maxlength="120" placeholder="Ex : viandes, crème, burrata"></label>' +
        tempField('temp', 'Température relevée (facultatif)') + byField() +
        '<div class="field span-2"><span>Résultat</span><div class="seg" role="group"><button type="button" data-ok="1" aria-pressed="true">Conforme</button><button type="button" data-ok="0" aria-pressed="false">Non conforme</button></div></div>' +
        '<div class="span-2" id="recAlert" hidden>' + chipsHTML(RECEPTION_ACTIONS) +
          '<label class="field" style="margin-top:8px"><span>Action</span><textarea name="action" maxlength="200" rows="2" placeholder="Ex : saumon refusé (8 °C), avoir demandé"></textarea></label></div>' +
      '</form>',
      footer: '<button class="btn btn--primary" type="submit" form="recForm">Enregistrer le contrôle</button>',
      onMount: function (sheet) {
        var form = $('#recForm', sheet), ok = true;
        wireCommon(sheet, form);
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-ok]');
          if (!b) return;
          ok = b.dataset.ok === '1';
          sheet.querySelectorAll('[data-ok]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          $('#recAlert', sheet).hidden = ok;
        });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var f = form.elements, who = f.by.value.trim(), temp = f.temp.value.trim() ? num(f.temp.value) : null;
          if (!f.product.value.trim()) return UI.toast('Indiquez les produits contrôlés');
          if (f.temp.value.trim() && temp == null) return UI.toast('Température illisible');
          if (!who) return UI.toast('Indiquez vos initiales');
          if (!ok && !f.action.value.trim()) return UI.toast('Indiquez l’action (refus, avoir…)');
          setBy(who);
          T.haccp.recordReception({ station: zone === 'all' ? f.station.value : zone, supplier: f.supplier.value.trim(), product: f.product.value.trim(),
            temp: temp, ok: ok, action: ok ? '' : f.action.value.trim(), by: who }).then(function () {
            UI.closeSheet(); UI.toast('Contrôle enregistré'); refresh();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  /* ---------------- Réglages (gérant) ---------------- */
  function openSettings() {
    var d = state.data;
    var eq = d.equipment.filter(function (e) { return e.active; }), tasks = d.tasks.filter(function (x) { return x.active; });
    UI.openSheet({
      label: 'Réglages HACCP',
      head: '<p class="eyebrow">HACCP</p><h2>Réglages</h2>',
      body: '<div class="margins-head"><h3>Appareils de froid</h3><button class="btn btn--ghost btn--sm" type="button" data-set-eq>+ Appareil</button></div>' +
        '<table class="loss-table"><tbody>' + eq.map(function (e) {
          return '<tr><td><strong>' + esc(e.name) + '</strong><small class="margin-src">' + STATION[e.station] + ' · ' + limits(e) + '</small></td>' +
            '<td style="text-align:right"><button class="link-btn" type="button" data-set-eq="' + esc(e.id) + '">Modifier</button></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="margins-head" style="margin-top:20px"><h3>Plan de nettoyage</h3><button class="btn btn--ghost btn--sm" type="button" data-set-task>+ Tâche</button></div>' +
        '<table class="loss-table"><tbody>' + tasks.map(function (x) {
          return '<tr><td><strong>' + esc(x.label) + '</strong><small class="margin-src">' + STATION[x.station] + ' · ' + FREQ[x.frequency] + '</small></td>' +
            '<td style="text-align:right"><button class="link-btn" type="button" data-set-task="' + esc(x.id) + '">Modifier</button></td></tr>';
        }).join('') + '</tbody></table>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var a = e.target.closest('[data-set-eq]');
          if (a) return openEquipment(a.dataset.setEq || null);
          var b = e.target.closest('[data-set-task]');
          if (b) return openTask(b.dataset.setTask || null);
        });
      }
    });
  }

  function stationSelect(value) {
    return '<label class="field"><span>Poste</span><select name="station">' + ['cuisine', 'bar'].map(function (s) {
      return '<option value="' + s + '"' + (s === value ? ' selected' : '') + '>' + STATION[s] + '</option>';
    }).join('') + '</select></label>';
  }

  function openEquipment(id) {
    var e = id ? state.data.equipment.filter(function (x) { return x.id === id; })[0] : { station: 'cuisine', name: '', kind: 'positif', min: 0, max: 4 };
    UI.openSheet({
      label: 'Appareil',
      head: '<p class="eyebrow">Appareil de froid</p><h2>' + (id ? esc(e.name) : 'Nouvel appareil') + '</h2>',
      body: '<form id="eqForm" class="form-grid" novalidate>' +
        '<label class="field span-2"><span>Nom</span><input name="name" maxlength="60" value="' + esc(e.name) + '" placeholder="Ex : Chambre froide, Frigo desserts"></label>' +
        stationSelect(e.station) +
        '<label class="field"><span>Type</span><select name="kind">' + Object.keys(KIND).map(function (k) {
          return '<option value="' + k + '"' + (k === e.kind ? ' selected' : '') + '>' + KIND[k] + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field"><span>Minimum (°C)</span><input name="min" type="text" inputmode="decimal" value="' + (e.min == null ? '' : e.min) + '" placeholder="vide = pas de minimum"></label>' +
        '<label class="field"><span>Maximum (°C)</span><input name="max" type="text" inputmode="decimal" value="' + (e.max == null ? '' : e.max) + '"></label>' +
      '</form>',
      footer: (id ? '<button class="btn btn--danger" type="button" id="eqDelete">Retirer</button>' : '') + '<button class="btn btn--primary" type="submit" form="eqForm">Enregistrer</button>',
      onMount: function (sheet) {
        var form = $('#eqForm', sheet), f = form.elements;
        f.kind.addEventListener('change', function () {
          if (f.kind.value === 'positif') { f.min.value = '0'; f.max.value = '4'; }
          if (f.kind.value === 'negatif') { f.min.value = ''; f.max.value = '-18'; }
        });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          if (!f.name.value.trim()) return UI.toast('Indiquez le nom');
          T.haccp.saveEquipment({ id: id, station: f.station.value, name: f.name.value.trim(), kind: f.kind.value,
            min: f.min.value.trim() ? num(f.min.value) : null, max: f.max.value.trim() ? num(f.max.value) : null }).then(function () {
            UI.toast('Appareil enregistré'); afterSettings();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
        var del = $('#eqDelete', sheet);
        if (del) del.addEventListener('click', function () {
          if (!confirm('Retirer « ' + e.name + ' » ? Ses relevés restent dans le registre.')) return;
          T.haccp.archive('equipment', id).then(function () { UI.toast('Appareil retiré'); afterSettings(); }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  function openTask(id) {
    var x = id ? state.data.tasks.filter(function (q) { return q.id === id; })[0] : { station: 'cuisine', label: '', frequency: 'jour' };
    UI.openSheet({
      label: 'Tâche de nettoyage',
      head: '<p class="eyebrow">Plan de nettoyage</p><h2>' + (id ? 'Modifier la tâche' : 'Nouvelle tâche') + '</h2>',
      body: '<form id="taskForm" class="form-grid" novalidate>' +
        '<label class="field span-2"><span>Tâche</span><input name="label" maxlength="80" value="' + esc(x.label) + '" placeholder="Ex : Friteuse filtrée"></label>' +
        stationSelect(x.station) +
        '<label class="field"><span>Fréquence</span><select name="frequency">' + Object.keys(FREQ).map(function (k) {
          return '<option value="' + k + '"' + (k === x.frequency ? ' selected' : '') + '>' + FREQ[k] + '</option>';
        }).join('') + '</select></label>' +
      '</form>',
      footer: (id ? '<button class="btn btn--danger" type="button" id="taskDelete">Retirer</button>' : '') + '<button class="btn btn--primary" type="submit" form="taskForm">Enregistrer</button>',
      onMount: function (sheet) {
        var form = $('#taskForm', sheet), f = form.elements;
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          if (!f.label.value.trim()) return UI.toast('Indiquez la tâche');
          T.haccp.saveTask({ id: id, station: f.station.value, label: f.label.value.trim(), frequency: f.frequency.value }).then(function () {
            UI.toast('Tâche enregistrée'); afterSettings();
          }, function (err) { UI.toast(esc(err.message), 5000); });
        });
        var del = $('#taskDelete', sheet);
        if (del) del.addEventListener('click', function () {
          if (!confirm('Retirer cette tâche du plan ? L’historique reste dans le registre.')) return;
          T.haccp.archive('task', id).then(function () { UI.toast('Tâche retirée'); afterSettings(); }, function (err) { UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  function afterSettings() {
    load().then(function () { rerender(); badge(); openSettings(); }, function (err) { UI.toast(esc(err.message), 5000); });
  }

  /* ---------------- Registre à imprimer (gérant) ---------------- */
  function openRegister() {
    var now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1), m1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var label = function (d) { return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
    UI.openSheet({
      label: 'Registre HACCP',
      head: '<p class="eyebrow">HACCP</p><h2>Registre à imprimer</h2><p class="help">À présenter lors d’un contrôle sanitaire : températures, actions correctives, nettoyages et livraisons de la période.</p>',
      body: '<div class="haccp-actions">' +
        '<button class="btn btn--primary" type="button" data-reg="0">' + esc(label(m0)) + '</button>' +
        '<button class="btn btn--soft" type="button" data-reg="1">' + esc(label(m1)) + '</button></div>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-reg]');
          if (!b) return;
          var from = b.dataset.reg === '0' ? m0 : m1, to = b.dataset.reg === '0' ? null : m0;
          // La fenêtre s'ouvre tout de suite (sinon le navigateur la bloque), le contenu arrive ensuite.
          var w = window.open('', '_blank');
          if (!w) return UI.toast('Autorisez les fenêtres pour imprimer le registre');
          w.document.write('<p style="font-family:sans-serif;padding:24px">Préparation du registre…</p>');
          T.haccp.load(from.getTime(), to ? to.getTime() : null).then(function (d) {
            printRegister(w, d, label(from));
          }, function (err) { w.close(); UI.toast(esc(err.message), 5000); });
        });
      }
    });
  }

  function printRegister(w, d, period) {
    var eqName = {}, taskName = {};
    d.equipment.forEach(function (e) { eqName[e.id] = e; });
    d.tasks.forEach(function (x) { taskName[x.id] = x; });
    var asc = function (a, b) { return a.at - b.at; };
    var readings = d.readings.slice().sort(asc), cleanings = d.cleanings.slice().sort(asc), receptions = d.receptions.slice().sort(asc);
    var bad = readings.filter(function (r) { return !r.ok; }).length + receptions.filter(function (r) { return !r.ok; }).length;
    var table = function (head, rows) {
      return rows.length ? '<table><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'
        : '<p class="none">Aucune saisie sur la période.</p>';
    };
    var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Registre HACCP · ' + esc(state.opts.restaurantName || '') + ' · ' + esc(period) + '</title>' +
      '<style>body{font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1b18;margin:24px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:24px 0 8px}' +
      '.sub{color:#6b655c;margin:4px 0 16px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top}' +
      'th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b655c}.ko{color:#a3352b;font-weight:700}.none{color:#6b655c}.sum{display:flex;gap:24px;flex-wrap:wrap}' +
      '.sum div{border:1px solid #ddd;border-radius:8px;padding:8px 12px}.sum b{display:block;font-size:18px}@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>' +
      '<h1>Registre HACCP · ' + esc(state.opts.restaurantName || '') + '</h1><p class="sub">Période : ' + esc(period) + ' · édité le ' + dmy(Date.now()) + ' avec Tapigo</p>' +
      '<div class="sum"><div><b>' + readings.length + '</b>relevés de température</div><div><b>' + cleanings.length + '</b>nettoyages</div>' +
        '<div><b>' + receptions.length + '</b>livraisons contrôlées</div><div><b' + (bad ? ' class="ko"' : '') + '>' + bad + '</b>non-conformités</div></div>' +
      '<h2>Appareils de froid</h2>' + table(['Appareil', 'Poste', 'Limites'], d.equipment.map(function (e) {
        return '<tr><td>' + esc(e.name) + (e.active ? '' : ' (retiré)') + '</td><td>' + STATION[e.station] + '</td><td>' + limits(e) + '</td></tr>';
      })) +
      '<h2>Relevés de température</h2>' + table(['Date', 'Heure', 'Appareil', 'T°', 'Conforme', 'Action corrective', 'Par'], readings.map(function (r) {
        var e = eqName[r.equipmentId];
        return '<tr><td>' + dmy(r.at) + '</td><td>' + hm(r.at) + '</td><td>' + esc(e ? e.name : '—') + '</td><td>' + deg(r.temp) + '</td>' +
          '<td' + (r.ok ? '>Oui' : ' class="ko">Non') + '</td><td>' + esc(r.action || '') + '</td><td>' + esc(r.by) + '</td></tr>';
      })) +
      '<h2>Plan de nettoyage réalisé</h2>' + table(['Date', 'Heure', 'Tâche', 'Poste', 'Par'], cleanings.map(function (c) {
        var x = taskName[c.taskId];
        return '<tr><td>' + dmy(c.at) + '</td><td>' + hm(c.at) + '</td><td>' + esc(x ? x.label : '—') + (c.note ? ' · ' + esc(c.note) : '') + '</td><td>' + STATION[c.station] + '</td><td>' + esc(c.by) + '</td></tr>';
      })) +
      '<h2>Contrôles à réception</h2>' + table(['Date', 'Fournisseur', 'Produits', 'T°', 'Conforme', 'Action', 'Par'], receptions.map(function (r) {
        return '<tr><td>' + dmy(r.at) + ' ' + hm(r.at) + '</td><td>' + esc(r.supplier || '—') + '</td><td>' + esc(r.product) + '</td><td>' + deg(r.temp) + '</td>' +
          '<td' + (r.ok ? '>Oui' : ' class="ko">Non') + '</td><td>' + esc(r.action || '') + '</td><td>' + esc(r.by) + '</td></tr>';
      })) +
      '<p class="sub" style="margin-top:24px">Traçabilité : les lots et dates limites des produits sont suivis dans l’onglet « Dates » de Tapigo.</p>' +
      '</body></html>';
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  }

  /* ---------------- Montage ---------------- */
  var currentRoot = null;
  function rerender() { if (currentRoot) render(currentRoot); }

  function mount(root, opts) {
    state.opts = opts || {};
    if (currentRoot !== root) {
      currentRoot = root;
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-h-seed]')) {
          return T.haccp.seed().then(refresh, function (err) { UI.toast(esc(err.message), 5000); });
        }
        var t = e.target.closest('[data-h-temp]');
        if (t) return openTemp(t.dataset.hTemp);
        var c = e.target.closest('[data-h-clean]');
        if (c) return markClean(c.dataset.hClean);
        if (e.target.closest('[data-h-reception]')) return openReception();
        if (e.target.closest('[data-h-by]')) return askBy(null);
        if (e.target.closest('[data-h-register]')) return openRegister();
        if (e.target.closest('[data-h-settings]')) return openSettings();
      });
    }
    state.data = null; state.error = '';
    render(root);
    refresh();
  }

  window.TapigoHaccp = { mount: mount, badge: badge };
})();
