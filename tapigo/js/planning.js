/* ==========================================================================
   Tapigo — Planning de l'équipe (onglet Planning)
   Gérant : semaine en grille (personnes × jours), créneaux en un geste,
   copie de la semaine précédente, publication, alertes (heures, repos,
   indisponibilités), affluence attendue d'après les ventes, coût estimé,
   demandes de l'équipe, pointage, impression et export des heures.
   Équipe : planning publié, « mon planning », indisponibilités, créneaux à
   remplacer, et pointage avec un code PIN personnel (tablette partagée).
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc, fmt = T.fmt;
  var POSTES = { bar: 'Bar', salle: 'Salle', cuisine: 'Cuisine', plonge: 'Plonge', direction: 'Direction' };
  var DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  var DAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  var ME_KEY = 'tapigo.v1.planning.me';
  var PRESETS = [['Midi', 11 * 60, 15 * 60], ['Soir', 18 * 60, 0], ['Journée', 10 * 60, 23 * 60], ['Fermeture', 19 * 60, 2 * 60]];
  // Repères d'alerte (à adapter à la convention collective de l'établissement).
  var MAX_DAY = 10 * 60, MIN_REST = 11 * 60, MAX_WEEK = 48 * 60;

  var state = { week: null, data: null, error: '', opts: {}, view: 'equipe', affluence: null, el: null, busy: false };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function mondayOf(d) { var x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); }
  function today() { return ymd(new Date()); }
  function hm(min) { min = ((min % 1440) + 1440) % 1440; return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
  function parseHm(v) { var m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function hours(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h + ' h' + (m ? ' ' + ('0' + m).slice(-2) : ''); }
  function span(s) { return ((s.end - s.start + 1440) % 1440) || 1440; }
  function work(s) { return Math.max(0, span(s) - (s.brk || 0)); }
  function dayIdx(day) { return Math.round((Date.parse(day + 'T12:00:00') - Date.parse(state.week + 'T12:00:00')) / 86400000); }
  function absStart(s) { return dayIdx(s.day) * 1440 + s.start; }
  function weekDays() { var out = []; for (var i = 0; i < 7; i++) out.push(addDays(state.week, i)); return out; }
  function dayLabel(day) { var d = new Date(day + 'T12:00:00'); return DAYS_LONG[(d.getDay() + 6) % 7] + ' ' + d.getDate(); }
  function weekLabel() {
    var a = new Date(state.week + 'T12:00:00'), b = new Date(addDays(state.week, 6) + 'T12:00:00');
    var month = function (d) { return d.toLocaleDateString('fr-FR', { month: 'long' }); };
    return 'Semaine du ' + a.getDate() + (a.getMonth() === b.getMonth() ? '' : ' ' + month(a)) + ' au ' + b.getDate() + ' ' + month(b);
  }
  function staff(id) { return (state.data.staff || []).filter(function (x) { return x.id === id; })[0]; }
  function activeStaff() { return state.data.staff.filter(function (x) { return x.active; }); }
  function me() { try { return localStorage.getItem(ME_KEY) || ''; } catch (e) { return ''; } }
  function setMe(id) { try { localStorage.setItem(ME_KEY, id); } catch (e) { /* ignore */ } }
  function manager() { return !!state.opts.manager && !(state.opts.demo && T.planning.asTeam); }
  function inWeek(day) { return day >= state.week && day < addDays(state.week, 7); }

  /* ---------------- Calculs ---------------- */
  function weekShifts(staffId) {
    return state.data.shifts.filter(function (s) { return inWeek(s.day) && (!staffId || s.staffId === staffId); });
  }
  function plannedMin(staffId) { return weekShifts(staffId).reduce(function (n, s) { return n + work(s); }, 0); }
  function punchedMin(staffId) {
    var from = Date.parse(state.week + 'T00:00:00'), to = Date.parse(addDays(state.week, 7) + 'T00:00:00');
    return state.data.punches.filter(function (p) { return p.staffId === staffId && p.start >= from && p.start < to; })
      .reduce(function (n, p) { return n + Math.max(0, ((p.end || Date.now()) - p.start) / 60000); }, 0);
  }
  function openPunch(staffId) { return state.data.punches.filter(function (p) { return p.staffId === staffId && !p.end && Date.now() - p.start < 20 * 3600000; })[0]; }

  function unavOn(staffId, day) { return state.data.unav.filter(function (u) { return u.staffId === staffId && u.day === day && u.status !== 'refusee'; }); }
  function unavHits(s, u) {
    if (u.start == null) return true;
    var a = s.start, b = s.start + span(s), c = u.start, d = u.end <= u.start ? u.end + 1440 : u.end;
    return a < d && c < b;
  }

  // Alertes de la semaine : [{ staffId, day, text, level: 'warn' | 'danger' }]
  function alerts() {
    var out = [];
    activeStaff().forEach(function (p) {
      var list = state.data.shifts.filter(function (s) { return s.staffId === p.id && s.day >= addDays(state.week, -1) && s.day < addDays(state.week, 7); })
        .sort(function (a, b) { return absStart(a) - absStart(b); });
      var total = plannedMin(p.id);
      if (total > MAX_WEEK) out.push({ staffId: p.id, text: p.name + ' : ' + hours(total) + ' prévues (au-delà de 48 h par semaine)', level: 'danger' });
      else if (p.weeklyHours && total > p.weeklyHours * 60) out.push({ staffId: p.id, text: p.name + ' : ' + hours(total - p.weeklyHours * 60) + ' de plus que son contrat (' + p.weeklyHours + ' h)', level: 'warn' });
      weekDays().forEach(function (day) {
        var d = list.filter(function (s) { return s.day === day; });
        var tot = d.reduce(function (n, s) { return n + work(s); }, 0);
        if (tot > MAX_DAY) out.push({ staffId: p.id, day: day, text: p.name + ' : ' + hours(tot) + ' le ' + dayLabel(day) + ' (plus de 10 h)', level: 'warn' });
        d.forEach(function (s) {
          unavOn(p.id, day).forEach(function (u) {
            if (unavHits(s, u)) out.push({ staffId: p.id, day: day, text: p.name + ' est indisponible le ' + dayLabel(day) + (u.status === 'en_attente' ? ' (demande à valider)' : ''), level: u.status === 'acceptee' ? 'danger' : 'warn' });
          });
        });
      });
      for (var i = 1; i < list.length; i++) {
        var prevEnd = absStart(list[i - 1]) + span(list[i - 1]), gap = absStart(list[i]) - prevEnd;
        if (!inWeek(list[i].day)) continue;
        if (gap < 0) out.push({ staffId: p.id, day: list[i].day, text: p.name + ' a deux créneaux qui se chevauchent le ' + dayLabel(list[i].day), level: 'danger' });
        else if (gap < MIN_REST && list[i].day !== list[i - 1].day) out.push({ staffId: p.id, day: list[i].day, text: p.name + ' : ' + hours(gap) + ' de repos seulement avant le ' + dayLabel(list[i].day) + ' (11 h minimum)', level: 'warn' });
      }
    });
    return out;
  }

  // Affluence moyenne par jour de la semaine (8 dernières semaines) : commandes et chiffre d'affaires.
  function loadAffluence() {
    if (state.affluence || !T.loadStats) return;
    state.affluence = { orders: [0, 0, 0, 0, 0, 0, 0], revenue: [0, 0, 0, 0, 0, 0, 0], ready: false };
    T.loadStats(56).then(function (orders) {
      var days = {}, a = state.affluence;
      orders.forEach(function (o) {
        var d = new Date(o.createdAt), k = ymd(d), w = (d.getDay() + 6) % 7;
        days[k] = w; a.orders[w] += 1; a.revenue[w] += Number(o.total) || 0;
      });
      var n = [0, 0, 0, 0, 0, 0, 0];
      Object.keys(days).forEach(function (k) { n[days[k]]++; });
      for (var i = 0; i < 7; i++) { if (n[i]) { a.orders[i] = Math.round(a.orders[i] / n[i]); a.revenue[i] = a.revenue[i] / n[i]; } }
      a.ready = true;
      paint();
    }, function () { state.affluence.ready = true; });
  }

  /* ---------------- Chargement ---------------- */
  function load() {
    state.busy = true;
    return T.planning.load(state.week).then(function (d) {
      state.data = d; state.error = '';
      // Équipe : « Mon planning » d'office quand l'appareil sait qui l'utilise.
      if (!state.viewChosen && !manager() && staff(me())) state.view = 'moi';
    }, function (err) { state.error = err.message; })
      .then(function () { state.busy = false; paint(); badge(); });
  }
  function reload(msg) { if (msg) UI.toast(msg); return load(); }
  function fail(err) { UI.toast(esc(err.message), 5000); }

  // Pastille de l'onglet : demandes de l'équipe à traiter (gérant).
  function badge() {
    var el = document.getElementById('planningCount');
    if (!el || !state.data) return;
    var n = manager() ? state.data.pendingUnav.length + state.data.pendingSwaps.filter(function (s) { return s.status === 'propose'; }).length : 0;
    el.hidden = !n; el.textContent = n;
  }

  /* ---------------- Page ---------------- */
  function paint() {
    var root = state.el;
    if (!root || !document.body.contains(root)) return;
    if (state.error) { root.innerHTML = '<div class="empty"><h3>Planning indisponible</h3><p>' + esc(state.error) + '</p></div>'; return; }
    if (!state.data) { root.innerHTML = '<div class="empty"><p>Chargement du planning…</p></div>'; return; }
    var m = manager();
    var demoSwitch = state.opts.demo ? '<div class="seg" role="group" aria-label="Aperçu">' +
      '<button type="button" data-pl-as="gerant" aria-pressed="' + !T.planning.asTeam + '">Vue gérant</button>' +
      '<button type="button" data-pl-as="equipe" aria-pressed="' + !!T.planning.asTeam + '">Vue équipe</button></div>' : '';
    var nav = '<div class="pl-nav"><button class="icon-btn" type="button" data-pl-week="-1" aria-label="Semaine précédente">‹</button>' +
      '<div class="pl-nav__label"><strong>' + esc(weekLabel()) + '</strong>' +
        (m ? (state.data.published ? '<span class="badge badge--ok">Publiée</span>' : '<span class="badge badge--warn">Brouillon : invisible pour l’équipe</span>') : '') + '</div>' +
      '<button class="icon-btn" type="button" data-pl-week="1" aria-label="Semaine suivante">›</button>' +
      (state.week !== mondayOf(new Date()) ? '<button class="btn btn--ghost btn--sm" type="button" data-pl-today>Cette semaine</button>' : '') + '</div>';
    root.innerHTML = '<div class="editor planning">' +
      '<div class="pl-top">' + nav + '<div class="pl-actions">' + demoSwitch + (m ? managerActions() : teamActions()) + '</div></div>' +
      (m ? managerBody() : teamBody()) +
    '</div>';
  }

  function managerActions() {
    return '<button class="btn btn--primary btn--sm" type="button" data-pl-clock>Pointage</button>' +
      '<button class="btn ' + (state.data.published ? 'btn--soft' : 'btn--primary') + ' btn--sm" type="button" data-pl-publish>' + (state.data.published ? 'Dépublier' : 'Publier la semaine') + '</button>' +
      '<button class="btn btn--soft btn--sm" type="button" data-pl-copy>Copier la semaine précédente</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-pl-staff>Équipe</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-pl-print>Imprimer</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-pl-export>Exporter les heures</button>';
  }

  function managerBody() {
    var d = state.data, al = alerts();
    if (!activeStaff().length) {
      return '<div class="empty"><h3>Ajoutez votre équipe</h3><p>Indiquez le prénom et le poste de chaque personne : vous pourrez ensuite placer leurs créneaux d’un geste.</p>' +
        '<p style="margin-top:16px"><button class="btn btn--primary" type="button" data-pl-staff>Ajouter l’équipe</button></p></div>';
    }
    var total = plannedMin(), cost = 0, costed = false;
    activeStaff().forEach(function (p) { if (p.hourlyCost != null) { costed = true; cost += plannedMin(p.id) / 60 * p.hourlyCost; } });
    var a = state.affluence, rev = a && a.ready ? a.revenue.reduce(function (x, y) { return x + y; }, 0) : 0;
    var requests = d.pendingUnav.length + d.pendingSwaps.length;
    return '<div class="stat-tiles stat-tiles--small">' +
        tile('Heures prévues', hours(total), activeStaff().length + ' personnes') +
        (costed ? tile('Coût estimé', fmt(cost), rev ? Math.round(cost / rev * 100) + ' % du chiffre d’affaires moyen d’une semaine' : 'coût horaire chargé × heures') : '') +
        tile('Alertes', String(al.length), al.length ? 'à vérifier ci-dessous' : 'rien à signaler') +
        tile('Demandes', String(requests), requests ? 'de l’équipe, à traiter' : 'aucune en attente') +
      '</div>' +
      requestsHTML() +
      gridHTML(true) +
      (al.length ? '<section class="chart-card"><h3>Alertes</h3><ul class="pl-alerts">' + al.map(function (x) {
        return '<li class="pl-alert pl-alert--' + x.level + '">' + esc(x.text) + '</li>';
      }).join('') + '</ul><p class="help">Repères généraux (10 h par jour, 11 h de repos, 48 h par semaine) : vérifiez les règles de votre convention collective.</p></section>' : '') +
      hoursHTML();
  }

  function tile(label, value, sub) {
    return '<div class="stat-tile"><span>' + esc(label) + '</span><b>' + value + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  function requestsHTML() {
    var d = state.data;
    if (!d.pendingUnav.length && !d.pendingSwaps.length) return '';
    return '<section class="forecast"><div class="forecast__head"><div><p class="eyebrow">Équipe</p><h2>Demandes à traiter</h2></div></div><div class="forecast__list">' +
      d.pendingUnav.map(function (u) {
        var p = staff(u.staffId) || { name: '?' };
        return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(p.name) + ' · indisponible</strong><small>' + esc(dayLabel(u.day)) +
          (u.start != null ? ' de ' + hm(u.start) + ' à ' + hm(u.end) : ', toute la journée') + (u.reason ? ' · ' + esc(u.reason) : '') + '</small></div>' +
          '<div class="pl-req"><button class="btn btn--primary btn--sm" type="button" data-pl-unav-ok="' + esc(u.id) + '">Accepter</button>' +
          '<button class="btn btn--soft btn--sm" type="button" data-pl-unav-no="' + esc(u.id) + '">Refuser</button></div></div>';
      }).join('') +
      d.pendingSwaps.map(function (s) {
        var p = staff(s.staffId) || { name: '?' }, q = s.proposedStaff && staff(s.proposedStaff);
        return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(p.name) + ' · ' + esc(dayLabel(s.day)) + ' ' + hm(s.start) + '–' + hm(s.end) + '</strong><small>' +
          (q ? esc(q.name) + ' propose de le remplacer' : 'à remplacer, personne ne l’a encore pris') + (s.swapReason ? ' · ' + esc(s.swapReason) : '') + '</small></div>' +
          '<div class="pl-req">' + (q ? '<button class="btn btn--primary btn--sm" type="button" data-pl-swap-ok="' + esc(s.id) + '">Valider ' + esc(q.name) + '</button>' : '') +
          '<button class="btn btn--soft btn--sm" type="button" data-pl-swap-no="' + esc(s.id) + '">' + (q ? 'Refuser' : 'Garder ' + esc(p.name)) + '</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-pl-edit="' + esc(s.id) + '">Réattribuer</button></div></div>';
      }).join('') + '</div></section>';
  }

  // Grille personnes × jours. editable : clic sur une case vide = nouveau créneau.
  function gridHTML(editable) {
    var days = weekDays(), a = state.affluence, people = activeStaff(), t = today();
    var maxOrders = a && a.ready ? Math.max.apply(null, a.orders.concat([1])) : 1;
    var head = '<tr><th class="pl-who">Équipe</th>' + days.map(function (day, i) {
      var n = people.filter(function (p) { return weekShifts(p.id).some(function (s) { return s.day === day; }); }).length;
      var o = a && a.ready ? a.orders[i] : 0;
      return '<th class="' + (day === t ? 'is-today' : '') + '"><span class="pl-day">' + DAYS[i] + ' <b>' + new Date(day + 'T12:00:00').getDate() + '</b></span>' +
        '<span class="pl-meta">👥 ' + n + (o ? ' · ~' + o + ' cmd' : '') + '</span>' +
        (o ? '<span class="pl-load"><span style="width:' + Math.round(o / maxOrders * 100) + '%"></span></span>' : '') + '</th>';
    }).join('') + '</tr>';
    var rows = people.map(function (p) {
      var tot = plannedMin(p.id), over = p.weeklyHours && tot > p.weeklyHours * 60;
      return '<tr><th class="pl-who"><div class="pl-who__in"><span class="pl-dot pl-dot--' + p.poste + '"></span><span><strong>' + esc(p.name) + '</strong>' +
        '<small class="' + (over ? 'pl-over' : '') + '">' + hours(tot) + (p.weeklyHours ? ' / ' + p.weeklyHours + ' h' : '') + ' · ' + POSTES[p.poste] + '</small></span></div></th>' +
        days.map(function (day) {
          var list = weekShifts(p.id).filter(function (s) { return s.day === day; }).sort(function (x, y) { return x.start - y.start; });
          var un = unavOn(p.id, day);
          return '<td class="' + (day === t ? 'is-today' : '') + (editable ? ' pl-cell' : '') + '"' + (editable ? ' data-pl-new="' + esc(p.id) + '|' + day + '"' : '') + '>' +
            un.map(function (u) {
              return '<button type="button" class="pl-unav' + (u.status === 'en_attente' ? ' is-pending' : '') + '" data-pl-unav="' + esc(u.id) + '">' +
                (u.status === 'en_attente' ? 'Indispo ?' : 'Indispo') + (u.start != null ? ' ' + hm(u.start) + '–' + hm(u.end) : '') + '</button>';
            }).join('') +
            list.map(function (s) {
              var q = s.proposedStaff && staff(s.proposedStaff);
              return '<button type="button" class="pl-shift pl-shift--' + s.poste + (s.status !== 'prevu' ? ' is-swap' : '') + '" data-pl-shift="' + esc(s.id) + '">' +
                '<b>' + hm(s.start) + '–' + hm(s.end) + '</b>' +
                '<small>' + (s.status === 'a_remplacer' ? 'à remplacer' : s.status === 'propose' && q ? '→ ' + esc(q.name) + ' ?' : (s.poste !== p.poste ? POSTES[s.poste] : hours(work(s)))) + '</small></button>';
            }).join('') +
            (editable && !list.length ? '<span class="pl-add" aria-hidden="true">+</span>' : '') + '</td>';
        }).join('') + '</tr>';
    }).join('');
    var foot = '<tr class="pl-foot"><th class="pl-who">Total</th>' + days.map(function (day) {
      var m = people.reduce(function (n, p) { return n + weekShifts(p.id).filter(function (s) { return s.day === day; }).reduce(function (k, s) { return k + work(s); }, 0); }, 0);
      return '<td>' + (m ? hours(m) : '—') + '</td>';
    }).join('') + '</tr>';
    return '<div class="pl-grid-wrap"><table class="pl-grid"><thead>' + head + '</thead><tbody>' + rows + foot + '</tbody></table></div>' +
      (editable ? '<p class="help">Touchez une case pour ajouter un créneau, un créneau pour le modifier. Les créneaux qui finissent après minuit sont comptés sur le jour où ils commencent.</p>' : '');
  }

  function hoursHTML() {
    var people = activeStaff();
    if (!state.data.punches.length) return '';
    return '<section class="chart-card"><h3>Heures de la semaine : prévues et pointées</h3><div style="overflow-x:auto"><table class="loss-table"><thead><tr>' +
      '<th>Personne</th><th>Prévues</th><th>Pointées</th><th>Écart</th><th></th></tr></thead><tbody>' +
      people.map(function (p) {
        var pl = plannedMin(p.id), pu = punchedMin(p.id), diff = pu - pl;
        return '<tr><td><strong>' + esc(p.name) + '</strong>' + (openPunch(p.id) ? '<small class="margin-src">en service</small>' : '') + '</td><td>' + hours(pl) + '</td><td>' + hours(pu) + '</td>' +
          '<td>' + (Math.abs(diff) < 15 ? '—' : (diff > 0 ? '+' : '−') + hours(Math.abs(diff))) + '</td>' +
          '<td style="text-align:right"><button class="link-btn" type="button" data-pl-punches="' + esc(p.id) + '">Détail</button></td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  /* ---------------- Vue équipe ---------------- */
  function teamActions() {
    var p = staff(me());
    return '<button class="btn btn--soft btn--sm" type="button" data-pl-me>' + (p ? 'Je suis ' + esc(p.name) + ' · changer' : 'Qui suis-je ?') + '</button>' +
      '<button class="btn btn--primary btn--sm" type="button" data-pl-clock>Pointage</button>';
  }

  function teamBody() {
    var d = state.data, p = staff(me());
    var open = d.pendingSwaps.filter(function (s) { return s.status === 'a_remplacer' && (!p || s.staffId !== p.id); });
    var tabs = '<div class="seg" role="group" style="margin-bottom:4px"><button type="button" data-pl-view="moi" aria-pressed="' + (state.view === 'moi') + '">Mon planning</button>' +
      '<button type="button" data-pl-view="equipe" aria-pressed="' + (state.view === 'equipe') + '">Toute l’équipe</button></div>';
    var openHTML = open.length ? '<section class="forecast"><div class="forecast__head"><div><p class="eyebrow">Coup de main</p><h2>Créneaux à reprendre</h2></div></div><div class="forecast__list">' +
      open.map(function (s) {
        var o = staff(s.staffId) || { name: '?' };
        return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(dayLabel(s.day)) + ' · ' + hm(s.start) + '–' + hm(s.end) + ' · ' + POSTES[s.poste] + '</strong><small>Créneau de ' + esc(o.name) +
          (s.swapReason ? ' · ' + esc(s.swapReason) : '') + '</small></div><button class="btn btn--primary btn--sm" type="button" data-pl-take="' + esc(s.id) + '">Je le prends</button></div>';
      }).join('') + '</div></section>' : '';
    if (!d.published) {
      return tabs + openHTML + '<div class="empty"><h3>Planning pas encore publié</h3><p>Le gérant prépare cette semaine. Vous la verrez ici dès qu’elle sera publiée.</p></div>' + myUnavHTML(p);
    }
    if (state.view === 'equipe' || !p) return tabs + openHTML + gridHTML(false) + (p ? '' : '<p class="help">Touchez « Qui suis-je ? » pour voir votre planning et vos heures.</p>');
    var mine = weekShifts(p.id).sort(function (a, b) { return absStart(a) - absStart(b); });
    return tabs + '<div class="stat-tiles stat-tiles--small">' +
        tile('Mes heures cette semaine', hours(plannedMin(p.id)), p.weeklyHours ? 'contrat : ' + p.weeklyHours + ' h' : '') +
        tile('Pointées', hours(punchedMin(p.id)), openPunch(p.id) ? 'en service depuis ' + hm(new Date(openPunch(p.id).start).getHours() * 60 + new Date(openPunch(p.id).start).getMinutes()) : '') +
      '</div>' + openHTML +
      '<section class="chart-card"><h3>Mes créneaux</h3>' + (mine.length ? '<div class="pl-mine">' + mine.map(function (s) {
        var future = s.day >= today();
        return '<div class="pl-mine__row"><div><strong>' + esc(dayLabel(s.day)) + '</strong><span>' + hm(s.start) + ' – ' + hm(s.end) + (s.brk ? ' · pause ' + s.brk + ' min' : '') + ' · ' + POSTES[s.poste] +
          (s.note ? ' · ' + esc(s.note) : '') + '</span></div>' +
          (s.status === 'a_remplacer' ? '<span class="badge badge--warn">à remplacer</span>' : s.status === 'propose' ? '<span class="badge badge--info">remplacement proposé</span>'
            : future ? '<button class="btn btn--ghost btn--sm" type="button" data-pl-release="' + esc(s.id) + '">Je ne peux pas</button>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="help">Aucun créneau pour vous cette semaine.</p>') + '</section>' + myUnavHTML(p);
  }

  function myUnavHTML(p) {
    if (!p) return '';
    var list = state.data.unav.filter(function (u) { return u.staffId === p.id; }).concat(state.data.pendingUnav.filter(function (u) { return u.staffId === p.id && !inWeek(u.day); }));
    return '<section class="chart-card"><div class="margins-head"><h3>Mes indisponibilités</h3><button class="btn btn--ghost btn--sm" type="button" data-pl-add-unav>+ Indisponibilité</button></div>' +
      (list.length ? '<div class="pl-mine">' + list.map(function (u) {
        return '<div class="pl-mine__row"><div><strong>' + esc(dayLabel(u.day)) + '</strong><span>' + (u.start != null ? hm(u.start) + ' – ' + hm(u.end) : 'Toute la journée') + (u.reason ? ' · ' + esc(u.reason) : '') + '</span></div>' +
          '<span class="badge ' + (u.status === 'acceptee' ? 'badge--ok' : u.status === 'refusee' ? 'badge--danger' : 'badge--warn') + '">' + (u.status === 'acceptee' ? 'acceptée' : u.status === 'refusee' ? 'refusée' : 'en attente') + '</span>' +
          (u.status !== 'refusee' && u.day >= today() ? '<button class="link-btn" type="button" data-pl-cancel-unav="' + esc(u.id) + '">Annuler</button>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="help">Prévenez le gérant à l’avance des jours où vous ne pouvez pas travailler.</p>') + '</section>';
  }

  /* ---------------- Code PIN (actions de l'équipe) ---------------- */
  function withPin(person, title, cb) {
    if (manager()) return cb(null);
    UI.openSheet({
      label: 'Code PIN',
      head: '<p class="eyebrow">' + esc(person.name) + '</p><h2>' + esc(title) + '</h2>',
      body: '<form id="pinForm" class="form-grid" novalidate><label class="field span-2"><span>Votre code PIN</span>' +
        '<input name="pin" class="pl-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="• • • •"></label>' +
        '<p class="help span-2">Le code à 4 chiffres donné par le gérant. Si vous n’en avez pas, laissez vide.</p></form>',
      footer: '<button class="btn btn--primary" type="submit" form="pinForm">Valider</button>',
      onMount: function (sheet) {
        var form = $('#pinForm', sheet), input = form.elements.pin;
        setTimeout(function () { input.focus(); }, 60);
        input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 4); if (input.value.length === 4) form.requestSubmit(); });
        form.addEventListener('submit', function (e) { e.preventDefault(); var pin = input.value; UI.closeSheet().then(function () { cb(pin); }); });
      }
    });
  }

  /* ---------------- Créneau (gérant) ---------------- */
  // Horaires les plus utilisés pour ce poste (suggestions), puis les horaires types.
  function suggestions(poste) {
    var count = {};
    state.data.shifts.filter(function (s) { return s.poste === poste; }).forEach(function (s) {
      var k = s.start + '-' + s.end + '-' + (s.brk || 0); count[k] = (count[k] || 0) + 1;
    });
    var top = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 4).map(function (k) {
      var x = k.split('-').map(Number); return { start: x[0], end: x[1], brk: x[2] };
    });
    PRESETS.forEach(function (p) {
      if (top.length < 6 && !top.some(function (t) { return t.start === p[1] && t.end === p[2]; })) top.push({ start: p[1], end: p[2], brk: 0, label: p[0] });
    });
    return top;
  }

  function openShift(id, staffId, day) {
    var s = id ? state.data.shifts.filter(function (x) { return x.id === id; })[0] : null;
    var p = staff(s ? s.staffId : staffId);
    var draft = s ? { staffId: s.staffId, day: s.day, start: s.start, end: s.end, brk: s.brk || 0, poste: s.poste, note: s.note }
      : (function () { var sg = suggestions(p.poste)[0]; return { staffId: p.id, day: day, start: sg.start, end: sg.end, brk: sg.brk || 0, poste: p.poste, note: '' }; })();
    var days = {}; days[draft.day] = true;
    function body() {
      var person = staff(draft.staffId), dur = work(draft), un = weekDays().filter(function (d) { return days[d]; }).map(function (d) {
        return unavOn(draft.staffId, d).filter(function (u) { return unavHits({ start: draft.start, end: draft.end }, u); }).length ? dayLabel(d) : null;
      }).filter(Boolean);
      return '<div class="pl-sugg">' + suggestions(draft.poste).map(function (g) {
          var on = g.start === draft.start && g.end === draft.end;
          return '<button type="button" class="chip' + '" aria-pressed="' + on + '" data-sg="' + g.start + '-' + g.end + '-' + (g.brk || 0) + '">' + (g.label ? g.label + ' · ' : '') + hm(g.start) + '–' + hm(g.end) + '</button>';
        }).join('') + '</div>' +
        '<form id="shiftForm" class="form-grid" novalidate style="margin-top:12px">' +
          '<label class="field"><span>Personne</span><select name="staff">' + activeStaff().map(function (x) {
            return '<option value="' + esc(x.id) + '"' + (x.id === draft.staffId ? ' selected' : '') + '>' + esc(x.name) + '</option>';
          }).join('') + '</select></label>' +
          '<label class="field"><span>Poste</span><select name="poste">' + Object.keys(POSTES).map(function (k) {
            return '<option value="' + k + '"' + (k === draft.poste ? ' selected' : '') + '>' + POSTES[k] + '</option>';
          }).join('') + '</select></label>' +
          '<label class="field"><span>Début</span><input name="start" type="time" step="900" value="' + hm(draft.start) + '"></label>' +
          '<label class="field"><span>Fin</span><input name="end" type="time" step="900" value="' + hm(draft.end) + '"></label>' +
          '<label class="field"><span>Pause</span><select name="brk">' + [0, 15, 30, 45, 60, 90].map(function (b) {
            return '<option value="' + b + '"' + (b === draft.brk ? ' selected' : '') + '>' + (b ? b + ' min' : 'aucune') + '</option>';
          }).join('') + '</select></label>' +
          '<label class="field"><span>Note</span><input name="note" maxlength="120" value="' + esc(draft.note) + '" placeholder="Ex : ouverture, inventaire"></label>' +
          (s ? '' : '<div class="field span-2"><span>Jours</span><div class="pl-days">' + weekDays().map(function (d, i) {
            return '<label><input type="checkbox" data-day="' + d + '"' + (days[d] ? ' checked' : '') + '><span>' + DAYS[i] + ' ' + new Date(d + 'T12:00:00').getDate() + '</span></label>';
          }).join('') + '</div></div>') +
        '</form>' +
        '<p class="pl-sum"><strong>' + hours(dur) + '</strong> de travail' + (draft.end <= draft.start ? ' · finit le lendemain' : '') +
          ' · ' + esc(person.name) + ' : ' + hours(plannedMin(person.id) - (s && s.staffId === person.id ? work(s) : 0) + dur * (s ? 1 : weekDays().filter(function (d) { return days[d]; }).length)) +
          ' cette semaine' + (person.weeklyHours ? ' (contrat ' + person.weeklyHours + ' h)' : '') + '</p>' +
        (un.length ? '<p class="pl-alert pl-alert--danger">' + esc(person.name) + ' a signalé une indisponibilité : ' + esc(un.join(', ')) + '</p>' : '');
    }
    UI.openSheet({
      label: 'Créneau',
      head: '<p class="eyebrow">' + (s ? 'Modifier le créneau' : 'Nouveau créneau') + '</p><h2>' + esc(p.name) + ' · ' + esc(dayLabel(draft.day)) + '</h2>',
      body: '<div id="shiftBody">' + body() + '</div>',
      footer: (s ? '<button class="btn btn--danger" type="button" id="shiftDelete">Supprimer</button>' : '') + '<button class="btn btn--primary" type="button" id="shiftSave">Enregistrer</button>',
      onMount: function (sheet) {
        var box = $('#shiftBody', sheet);
        var read = function () {
          var f = $('#shiftForm', sheet).elements;
          draft.staffId = f.staff.value; draft.poste = f.poste.value; draft.note = f.note.value.trim(); draft.brk = +f.brk.value;
          var a = parseHm(f.start.value), b = parseHm(f.end.value);
          if (a != null) draft.start = a; if (b != null) draft.end = b;
        };
        var repaint = function () { box.innerHTML = body(); };
        box.addEventListener('click', function (e) {
          var g = e.target.closest('[data-sg]');
          if (g) { read(); var x = g.dataset.sg.split('-').map(Number); draft.start = x[0]; draft.end = x[1]; draft.brk = x[2]; repaint(); }
        });
        box.addEventListener('change', function (e) {
          if (e.target.matches('[data-day]')) { days[e.target.dataset.day] = e.target.checked; }
          read();
          if (e.target.name === 'staff') { var np = staff(draft.staffId); if (np) draft.poste = np.poste; }
          repaint();
        });
        $('#shiftSave', sheet).addEventListener('click', function (e) {
          read();
          if (draft.start === draft.end) return UI.toast('Le début et la fin sont identiques');
          var list = s ? [draft.day] : weekDays().filter(function (d) { return days[d]; });
          if (!list.length) return UI.toast('Choisissez au moins un jour');
          e.target.disabled = true;
          list.reduce(function (pr, d) {
            return pr.then(function () { return T.planning.saveShift(Object.assign({}, draft, { id: s ? s.id : null, day: d })); });
          }, Promise.resolve()).then(function () {
            UI.closeSheet(); reload(list.length > 1 ? list.length + ' créneaux ajoutés' : 'Créneau enregistré');
          }, function (err) { e.target.disabled = false; fail(err); });
        });
        var del = $('#shiftDelete', sheet);
        if (del) del.addEventListener('click', function () {
          T.planning.deleteShift(s.id).then(function () { UI.closeSheet(); reload('Créneau supprimé'); }, fail);
        });
      }
    });
  }

  /* ---------------- Équipe (gérant) ---------------- */
  function openStaffList() {
    UI.openSheet({
      label: 'Équipe',
      head: '<p class="eyebrow">Planning</p><h2>L’équipe</h2>',
      body: '<div class="margins-head"><p class="help" style="margin:0">Les personnes à placer dans le planning. Le code PIN sert à pointer et à faire ses demandes depuis la tablette partagée.</p>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-staff-edit>+ Personne</button></div>' +
        '<table class="loss-table"><tbody>' + state.data.staff.map(function (x) {
          return '<tr' + (x.active ? '' : ' style="opacity:.55"') + '><td><span class="pl-dot pl-dot--' + x.poste + '"></span> <strong>' + esc(x.name) + '</strong>' +
            '<small class="margin-src">' + POSTES[x.poste] + (x.weeklyHours ? ' · ' + x.weeklyHours + ' h / semaine' : '') + (x.hourlyCost != null ? ' · ' + fmt(x.hourlyCost) + ' / h' : '') +
            (x.hasPin ? ' · code PIN ✓' : ' · sans code PIN') + (x.active ? '' : ' · ne travaille plus ici') + '</small></td>' +
            '<td style="text-align:right"><button class="link-btn" type="button" data-staff-edit="' + esc(x.id) + '">Modifier</button></td></tr>';
        }).join('') + '</tbody></table>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) { var b = e.target.closest('[data-staff-edit]'); if (b) openStaff(b.dataset.staffEdit || null); });
      }
    });
  }

  function openStaff(id) {
    var x = id ? staff(id) : { name: '', poste: 'salle', weeklyHours: 35, hourlyCost: null, hasPin: false, active: true };
    UI.openSheet({
      label: 'Personne',
      head: '<p class="eyebrow">Équipe</p><h2>' + (id ? esc(x.name) : 'Nouvelle personne') + '</h2>',
      body: '<form id="staffForm" class="form-grid" novalidate>' +
        '<label class="field"><span>Prénom</span><input name="name" maxlength="40" value="' + esc(x.name) + '" autofocus></label>' +
        '<label class="field"><span>Poste</span><select name="poste">' + Object.keys(POSTES).map(function (k) {
          return '<option value="' + k + '"' + (k === x.poste ? ' selected' : '') + '>' + POSTES[k] + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field"><span>Heures du contrat / semaine</span><input name="hours" type="number" min="0" max="60" step="0.5" value="' + (x.weeklyHours == null ? '' : x.weeklyHours) + '" placeholder="Ex : 35"></label>' +
        '<label class="field"><span>Coût horaire chargé (facultatif)</span><input name="cost" type="number" min="0" max="500" step="0.01" value="' + (x.hourlyCost == null ? '' : x.hourlyCost) + '" placeholder="€ / heure"></label>' +
        '<label class="field"><span>Code PIN (4 chiffres)</span><input name="pin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="' + (x.hasPin ? 'inchangé' : 'aucun') + '"></label>' +
        (x.hasPin ? '<label class="check-line"><input type="checkbox" name="nopin"><span>Retirer le code PIN</span></label>' : '<span></span>') +
        '<label class="switch span-2"><input type="checkbox" name="active"' + (x.active ? ' checked' : '') + '><span class="switch__track"></span><span>Travaille actuellement ici</span></label>' +
        '<p class="help span-2">Le coût horaire n’est visible que par le gérant : il sert à estimer la masse salariale de la semaine.</p>' +
      '</form>',
      footer: '<button class="btn btn--primary" type="submit" form="staffForm">Enregistrer</button>',
      onMount: function (sheet) {
        var form = $('#staffForm', sheet), f = form.elements;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!f.name.value.trim()) return UI.toast('Indiquez le prénom');
          var pin = f.nopin && f.nopin.checked ? '' : (f.pin.value.trim() || null);
          if (pin && !/^\d{4}$/.test(pin)) return UI.toast('Le code PIN fait 4 chiffres');
          var num = function (v) { return v === '' ? null : Number(v); };
          T.planning.saveStaff({ id: id, name: f.name.value.trim(), poste: f.poste.value, weeklyHours: num(f.hours.value), hourlyCost: num(f.cost.value), pin: pin, active: f.active.checked })
            .then(function () { return load(); }).then(function () { UI.toast('Équipe enregistrée'); openStaffList(); }, fail);
        });
      }
    });
  }

  /* ---------------- Indisponibilité ---------------- */
  function openUnav(staffId) {
    var p = staff(staffId);
    UI.openSheet({
      label: 'Indisponibilité',
      head: '<p class="eyebrow">' + esc(p.name) + '</p><h2>Je ne suis pas disponible</h2>',
      body: '<form id="unavForm" class="form-grid" novalidate>' +
        '<label class="field"><span>Jour</span><input name="day" type="date" value="' + addDays(today(), 1) + '" min="' + today() + '"></label>' +
        '<label class="field"><span>Quand</span><select name="when"><option value="day">Toute la journée</option><option value="hours">Seulement des heures</option></select></label>' +
        '<label class="field" data-hours hidden><span>De</span><input name="start" type="time" step="900" value="18:00"></label>' +
        '<label class="field" data-hours hidden><span>À</span><input name="end" type="time" step="900" value="23:00"></label>' +
        '<label class="field span-2"><span>Motif (facultatif)</span><input name="reason" maxlength="120" placeholder="Ex : examen, rendez-vous"></label>' +
        '<p class="help span-2">' + (manager() ? 'Enregistrée directement.' : 'Le gérant la valide ; il la voit dans le planning.') + '</p></form>',
      footer: '<button class="btn btn--primary" type="submit" form="unavForm">Envoyer</button>',
      onMount: function (sheet) {
        var form = $('#unavForm', sheet), f = form.elements;
        f.when.addEventListener('change', function () { sheet.querySelectorAll('[data-hours]').forEach(function (el) { el.hidden = f.when.value !== 'hours'; }); });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var x = { staffId: p.id, day: f.day.value, reason: f.reason.value.trim(), start: null, end: null };
          if (!x.day) return UI.toast('Choisissez le jour');
          if (f.when.value === 'hours') { x.start = parseHm(f.start.value); x.end = parseHm(f.end.value); }
          UI.closeSheet().then(function () {
            withPin(p, 'Confirmer', function (pin) {
              T.planning.addUnav(x, pin).then(function () { reload(manager() ? 'Indisponibilité enregistrée' : 'Demande envoyée au gérant'); }, fail);
            });
          });
        });
      }
    });
  }

  function openUnavDetail(id) {
    var u = state.data.unav.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var p = staff(u.staffId) || { name: '?' };
    var m = manager();
    UI.openSheet({
      label: 'Indisponibilité',
      head: '<p class="eyebrow">Indisponibilité</p><h2>' + esc(p.name) + ' · ' + esc(dayLabel(u.day)) + '</h2>',
      body: '<p class="sub">' + (u.start != null ? 'De ' + hm(u.start) + ' à ' + hm(u.end) : 'Toute la journée') + (u.reason ? ' · ' + esc(u.reason) : '') + '</p>' +
        '<p><span class="badge ' + (u.status === 'acceptee' ? 'badge--ok' : 'badge--warn') + '">' + (u.status === 'acceptee' ? 'acceptée' : 'en attente') + '</span></p>',
      footer: m ? (u.status === 'en_attente' ? '<button class="btn btn--soft" type="button" data-d="no">Refuser</button><button class="btn btn--primary" type="button" data-d="ok">Accepter</button>'
        : '<button class="btn btn--danger" type="button" data-d="del">Supprimer</button>') : '',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-d]');
          if (!b) return;
          var pr = b.dataset.d === 'del' ? T.planning.cancelUnav(u.id, null) : T.planning.decideUnav(u.id, b.dataset.d === 'ok');
          pr.then(function () { UI.closeSheet(); reload(); }, fail);
        });
      }
    });
  }

  /* ---------------- Pointage ---------------- */
  function openClock() {
    var list = activeStaff();
    if (!list.length) return UI.toast('Ajoutez d’abord l’équipe');
    UI.openSheet({
      label: 'Pointage',
      head: '<p class="eyebrow">Pointage</p><h2>Qui commence ou termine ?</h2>',
      body: '<div class="pl-clock">' + list.map(function (p) {
        var o = openPunch(p.id);
        return '<button type="button" class="pl-clock__btn' + (o ? ' is-in' : '') + '" data-clock="' + esc(p.id) + '"><span class="pl-dot pl-dot--' + p.poste + '"></span>' +
          '<strong>' + esc(p.name) + '</strong><small>' + (o ? 'En service depuis ' + new Date(o.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' · toucher pour terminer' : 'Toucher pour commencer') + '</small></button>';
      }).join('') + '</div>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-clock]');
          if (!b) return;
          var p = staff(b.dataset.clock), o = openPunch(p.id);
          UI.closeSheet().then(function () {
            withPin(p, o ? 'Terminer mon service' : 'Commencer mon service', function (pin) {
              T.planning.clock(p.id, pin).then(function (r) {
                var at = new Date(r.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                reload(r.kind === 'in' ? 'Bon service ' + esc(p.name) + ' ! Arrivée à ' + at : 'Merci ' + esc(p.name) + ' · départ à ' + at + (r.startedAt ? ' (' + hours((r.at - r.startedAt) / 60000) + ')' : ''));
              }, fail);
            });
          });
        });
      }
    });
  }

  function openPunches(staffId) {
    var p = staff(staffId);
    var from = Date.parse(state.week + 'T00:00:00'), to = Date.parse(addDays(state.week, 7) + 'T00:00:00');
    var list = state.data.punches.filter(function (x) { return x.staffId === staffId && x.start >= from && x.start < to; });
    var local = function (ms) { var d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
    UI.openSheet({
      label: 'Pointages',
      head: '<p class="eyebrow">Pointages</p><h2>' + esc(p.name) + '</h2>',
      body: list.length ? '<div class="pl-mine">' + list.map(function (x) {
        return '<form class="pl-punch" data-punch="' + esc(x.id) + '"><input type="datetime-local" name="start" value="' + local(x.start) + '">' +
          '<input type="datetime-local" name="end" value="' + (x.end ? local(x.end) : '') + '">' +
          '<button class="btn btn--soft btn--sm" type="submit">Corriger</button>' + (x.edited ? '<small class="margin-src">corrigé</small>' : '') + '</form>';
      }).join('') + '</div><p class="help">Corrigez un oubli (départ non pointé, mauvaise heure). La correction est notée.</p>' : '<p class="help">Aucun pointage cette semaine.</p>',
      onMount: function (sheet) {
        sheet.addEventListener('submit', function (e) {
          e.preventDefault();
          var f = e.target, s = Date.parse(f.elements.start.value), en = f.elements.end.value ? Date.parse(f.elements.end.value) : null;
          T.planning.editPunch(f.dataset.punch, s, en).then(function () { UI.closeSheet(); reload('Pointage corrigé'); }, fail);
        });
      }
    });
  }

  /* ---------------- Impression et export ---------------- */
  function print() {
    var w = window.open('', '_blank');
    if (!w) return UI.toast('Autorisez les fenêtres pour imprimer le planning');
    var days = weekDays(), people = activeStaff();
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planning · ' + esc(weekLabel()) + '</title><style>' +
      'body{font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1b18;margin:20px}h1{font-size:18px;margin:0 0 4px}p{color:#6b655c;margin:0 0 12px}' +
      'table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px;vertical-align:top;text-align:left}th{background:#f4f0e8}td small{color:#6b655c}' +
      '@page{size:landscape}@media print{body{margin:0}}</style></head><body>' +
      '<h1>Planning · ' + esc(state.opts.restaurantName || '') + '</h1><p>' + esc(weekLabel()) + (state.data.published ? '' : ' · brouillon') + '</p>' +
      '<table><thead><tr><th>Équipe</th>' + days.map(function (d, i) { return '<th>' + DAYS[i] + ' ' + new Date(d + 'T12:00:00').getDate() + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>' +
      people.map(function (p) {
        return '<tr><th>' + esc(p.name) + '<br><small>' + POSTES[p.poste] + '</small></th>' + days.map(function (d) {
          return '<td>' + weekShifts(p.id).filter(function (s) { return s.day === d; }).map(function (s) {
            return hm(s.start) + '–' + hm(s.end) + (s.brk ? '<br><small>pause ' + s.brk + ' min</small>' : '') + (s.note ? '<br><small>' + esc(s.note) + '</small>' : '');
          }).join('<br>') + '</td>';
        }).join('') + '<td>' + hours(plannedMin(p.id)) + '</td></tr>';
      }).join('') + '</tbody></table></body></html>');
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 300);
  }

  function exportHours() {
    var rows = [['Semaine', 'Personne', 'Poste', 'Contrat (h)', 'Heures prévues', 'Heures pointées', 'Coût estimé (€)']];
    activeStaff().forEach(function (p) {
      var pl = plannedMin(p.id) / 60, pu = punchedMin(p.id) / 60;
      rows.push([state.week, p.name, POSTES[p.poste], p.weeklyHours == null ? '' : p.weeklyHours, pl.toFixed(2).replace('.', ','), pu.toFixed(2).replace('.', ','),
        p.hourlyCost == null ? '' : (pl * p.hourlyCost).toFixed(2).replace('.', ',')]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'heures-' + state.week + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast('Heures exportées (fichier pour la paie ou le comptable)');
  }

  function chooseMe() {
    UI.openSheet({
      label: 'Qui suis-je',
      head: '<p class="eyebrow">Planning</p><h2>Qui êtes-vous ?</h2>',
      body: '<div class="pl-clock">' + activeStaff().map(function (p) {
        return '<button type="button" class="pl-clock__btn' + (p.id === me() ? ' is-in' : '') + '" data-me="' + esc(p.id) + '"><span class="pl-dot pl-dot--' + p.poste + '"></span><strong>' + esc(p.name) + '</strong><small>' + POSTES[p.poste] + '</small></button>';
      }).join('') + '</div><p class="help">Retenu sur cet appareil. Sur une tablette partagée, chacun choisit son prénom.</p>',
      onMount: function (sheet) {
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest('[data-me]');
          if (b) { setMe(b.dataset.me); state.view = 'moi'; UI.closeSheet(); paint(); }
        });
      }
    });
  }

  /* ---------------- Montage ---------------- */
  function onClick(e) {
    var t = e.target;
    var w = t.closest('[data-pl-week]');
    if (w) { state.week = addDays(state.week, 7 * +w.dataset.plWeek); state.data = null; paint(); return load(); }
    if (t.closest('[data-pl-today]')) { state.week = mondayOf(new Date()); state.data = null; paint(); return load(); }
    var as = t.closest('[data-pl-as]');
    if (as) { T.planning.asTeam = as.dataset.plAs === 'equipe'; return load(); }
    var v = t.closest('[data-pl-view]');
    if (v) { state.view = v.dataset.plView; state.viewChosen = true; if (state.view === 'moi' && !staff(me())) return chooseMe(); return paint(); }
    if (t.closest('[data-pl-me]')) return chooseMe();
    if (t.closest('[data-pl-clock]')) return openClock();
    if (t.closest('[data-pl-staff]')) return openStaffList();
    if (t.closest('[data-pl-print]')) return print();
    if (t.closest('[data-pl-export]')) return exportHours();
    if (t.closest('[data-pl-publish]')) {
      var on = !state.data.published;
      if (on && !weekShifts().length) return UI.toast('Ajoutez des créneaux avant de publier');
      return T.planning.publish(state.week, on).then(function () { reload(on ? 'Semaine publiée : l’équipe la voit' : 'Semaine repassée en brouillon'); }, fail);
    }
    if (t.closest('[data-pl-copy]')) {
      return T.planning.copyWeek(addDays(state.week, -7), state.week).then(function (n) {
        reload(n ? n + ' créneau' + (n > 1 ? 'x' : '') + ' recopié' + (n > 1 ? 's' : '') + ' de la semaine précédente' : 'Rien à recopier (les jours déjà remplis sont gardés)');
      }, fail);
    }
    var sh = t.closest('[data-pl-shift]') || t.closest('[data-pl-edit]');
    if (sh) {
      var id = sh.dataset.plShift || sh.dataset.plEdit;
      if (manager()) return openShift(id);
      var s = state.data.shifts.filter(function (x) { return x.id === id; })[0];
      var mine = s && s.staffId === me();
      if (s && s.status === 'a_remplacer' && !mine && staff(me())) return take(s.id);
      return UI.toast(s ? esc((staff(s.staffId) || {}).name || '') + ' · ' + hm(s.start) + '–' + hm(s.end) + ' · ' + POSTES[s.poste] + (s.note ? ' · ' + esc(s.note) : '') : '');
    }
    var nw = t.closest('[data-pl-new]');
    if (nw && manager()) { var k = nw.dataset.plNew.split('|'); return openShift(null, k[0], k[1]); }
    var un = t.closest('[data-pl-unav]');
    if (un) return openUnavDetail(un.dataset.plUnav);
    var ok = t.closest('[data-pl-unav-ok]'), no = t.closest('[data-pl-unav-no]');
    if (ok || no) return T.planning.decideUnav((ok || no).dataset[ok ? 'plUnavOk' : 'plUnavNo'], !!ok).then(function () { reload(ok ? 'Indisponibilité acceptée' : 'Indisponibilité refusée'); }, fail);
    var sok = t.closest('[data-pl-swap-ok]'), sno = t.closest('[data-pl-swap-no]');
    if (sok || sno) return T.planning.decideSwap((sok || sno).dataset[sok ? 'plSwapOk' : 'plSwapNo'], !!sok).then(function () { reload(sok ? 'Remplacement validé' : 'Créneau gardé'); }, fail);
    var pu = t.closest('[data-pl-punches]');
    if (pu) return openPunches(pu.dataset.plPunches);
    if (t.closest('[data-pl-add-unav]')) return openUnav(me());
    var cu = t.closest('[data-pl-cancel-unav]');
    if (cu) {
      var person = staff(me());
      return withPin(person, 'Annuler l’indisponibilité', function (pin) { T.planning.cancelUnav(cu.dataset.plCancelUnav, pin).then(function () { reload('Indisponibilité annulée'); }, fail); });
    }
    var rel = t.closest('[data-pl-release]');
    if (rel) return release(rel.dataset.plRelease);
    var tk = t.closest('[data-pl-take]');
    if (tk) return take(tk.dataset.plTake);
  }

  function release(id) {
    var p = staff(me());
    UI.openSheet({
      label: 'Je ne peux pas',
      head: '<p class="eyebrow">' + esc(p.name) + '</p><h2>Je ne peux pas venir</h2>',
      body: '<form id="relForm" class="form-grid" novalidate><label class="field span-2"><span>Pourquoi ? (facultatif)</span><input name="reason" maxlength="120" placeholder="Ex : rendez-vous médical"></label>' +
        '<p class="help span-2">Le créneau est proposé aux collègues. Le gérant valide le remplacement.</p></form>',
      footer: '<button class="btn btn--primary" type="submit" form="relForm">Proposer le créneau</button>',
      onMount: function (sheet) {
        var form = $('#relForm', sheet);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var reason = form.elements.reason.value.trim();
          UI.closeSheet().then(function () {
            withPin(p, 'Confirmer', function (pin) { T.planning.release(id, reason, pin).then(function () { reload('Créneau proposé à l’équipe'); }, fail); });
          });
        });
      }
    });
  }

  function take(id) {
    var p = staff(me());
    if (!p) return chooseMe();
    withPin(p, 'Je prends ce créneau', function (pin) {
      T.planning.take(id, p.id, pin).then(function () { reload('Proposé au gérant : il valide le remplacement'); }, fail);
    });
  }

  // opts : { manager, demo, restaurantName }
  function mount(root, opts) {
    state.opts = opts || {};
    state.el = root;
    if (!state.week) state.week = mondayOf(new Date());
    if (!root.dataset.wired) { root.dataset.wired = '1'; root.addEventListener('click', onClick); }
    loadAffluence();
    paint();
    load();
  }

  window.TapigoPlanning = { mount: mount, badge: function (opts) {
    if (!T.planning) return;
    if (opts) state.opts = Object.assign({}, state.opts, opts);
    if (!state.week) state.week = mondayOf(new Date());
    T.planning.load(state.week).then(function (d) { state.data = d; badge(); }, function () {});
  } };
})();
