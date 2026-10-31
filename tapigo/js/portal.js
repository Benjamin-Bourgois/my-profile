/* ==========================================================================
   Tapigo — Page personnelle du planning (planning.html?t=…)
   Ouverte depuis le lien envoyé par le gérant, sans compte : mes créneaux,
   mes heures, qui travaille avec moi, « je ne peux pas », créneaux à
   reprendre, indisponibilités, et ajout des créneaux à l'agenda du téléphone.
   ========================================================================== */
(function () {
  'use strict';

  var T = window.Tapigo, UI = window.TapigoUI, esc = T.esc;
  var POSTES = { bar: 'Bar', salle: 'Salle', cuisine: 'Cuisine', plonge: 'Plonge', direction: 'Direction' };
  var token = (new URLSearchParams(location.search).get('t') || '').replace(/[^0-9a-z]/gi, '').slice(0, 80);
  var state = { data: null, week: null, error: '' };
  var root = document.getElementById('portal');

  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function mondayOf(d) { var x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); }
  function today() { return ymd(new Date()); }
  function hm(min) { min = ((min % 1440) + 1440) % 1440; return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
  function parseHm(v) { var m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function hours(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h + ' h' + (m ? ' ' + ('0' + m).slice(-2) : ''); }
  function span(s) { return ((s.end - s.start + 1440) % 1440) || 1440; }
  function work(s) { return Math.max(0, span(s) - (s.brk || 0)); }
  function dayLabel(day) { var t = new Date(day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  function weekLabel(w) {
    var a = new Date(w + 'T12:00:00'), b = new Date(addDays(w, 6) + 'T12:00:00');
    if (w === mondayOf(new Date())) return 'Cette semaine';
    if (w === addDays(mondayOf(new Date()), 7)) return 'Semaine prochaine';
    return 'Du ' + a.getDate() + ' au ' + b.getDate() + ' ' + b.toLocaleDateString('fr-FR', { month: 'short' });
  }
  function name(id) { var p = state.data.staff.filter(function (x) { return x.id === id; })[0]; return p ? p.name : '?'; }
  function inWeek(s) { return s.day >= state.week && s.day < addDays(state.week, 7); }

  function load() {
    return T.portal.load(token).then(function (d) {
      state.data = d; state.error = '';
      if (!state.week || d.weeks.indexOf(state.week) < 0) {
        var cur = mondayOf(new Date());
        state.week = d.weeks.indexOf(cur) >= 0 ? cur : (d.weeks.filter(function (w) { return w > cur; })[0] || d.weeks[d.weeks.length - 1] || cur);
      }
    }, function (err) { state.error = err.message; }).then(paint);
  }

  function paint() {
    if (state.error) {
      root.innerHTML = '<div class="empty"><h3>Lien non valide</h3><p>' + esc(state.error) + '</p></div>';
      return;
    }
    var d = state.data, me = d.me, t = today();
    var mine = d.shifts.filter(function (s) { return s.staffId === me.id; });
    var next = mine.filter(function (s) { return s.day >= t && s.status !== 'propose'; })[0];
    var week = mine.filter(inWeek);
    var total = week.reduce(function (n, s) { return n + work(s); }, 0);
    var open = d.shifts.filter(function (s) { return s.status === 'a_remplacer' && s.staffId !== me.id && s.day >= t; });
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(state.week, i));

    root.innerHTML =
      '<header class="portal__head"><p class="eyebrow">' + esc(d.restaurant) + '</p><h1>Bonjour ' + esc(me.name) + '</h1>' +
        (next ? '<div class="portal__next"><span>Prochain service</span><strong>' + esc(dayLabel(next.day)) + '</strong><b>' + hm(next.start) + ' – ' + hm(next.end) + '</b>' +
          '<small>' + POSTES[next.poste] + (next.brk ? ' · pause ' + next.brk + ' min' : '') + (next.note ? ' · ' + esc(next.note) : '') + '</small></div>'
          : '<p class="help">Aucun service prévu pour le moment.</p>') + '</header>' +
      (d.weeks.length ? '<div class="chips portal__weeks">' + d.weeks.map(function (w) {
        return '<button class="chip" type="button" data-week="' + w + '" aria-pressed="' + (w === state.week) + '">' + esc(weekLabel(w)) + '</button>';
      }).join('') + '</div>' : '') +
      (!d.weeks.length ? '<div class="empty"><h3>Pas encore de planning publié</h3><p>Votre responsable ne l’a pas encore publié. Revenez bientôt sur ce lien.</p></div>' :
      '<div class="stat-tiles stat-tiles--small">' +
        '<div class="stat-tile"><span>Mes heures</span><b>' + hours(total) + '</b><small>' + (me.weeklyHours ? 'contrat : ' + me.weeklyHours + ' h' : esc(weekLabel(state.week).toLowerCase())) + '</small></div>' +
        '<div class="stat-tile"><span>Services</span><b>' + week.length + '</b><small>' + esc(weekLabel(state.week).toLowerCase()) + '</small></div>' +
      '</div>' +
      (open.length ? '<section class="forecast"><div class="forecast__head"><div><p class="eyebrow">Coup de main</p><h2>Créneaux à reprendre</h2></div></div><div class="forecast__list">' +
        open.map(function (s) {
          return '<div class="fc-row"><div class="fc-row__name"><strong>' + esc(dayLabel(s.day)) + '</strong><small>' + hm(s.start) + ' – ' + hm(s.end) + ' · ' + POSTES[s.poste] + ' · créneau de ' + esc(name(s.staffId)) +
            (s.swapReason ? ' · ' + esc(s.swapReason) : '') + '</small></div><button class="btn btn--primary btn--sm" type="button" data-take="' + esc(s.id) + '">Je le prends</button></div>';
        }).join('') + '</div></section>' : '') +
      '<section class="chart-card"><h3>Ma semaine</h3><div class="portal__days">' + days.map(function (day) {
        var my = week.filter(function (s) { return s.day === day; });
        var team = d.shifts.filter(function (s) { return s.day === day && s.staffId !== me.id; });
        return '<details class="portal__day' + (day === t ? ' is-today' : '') + (my.length ? ' is-working' : '') + '"' + (my.length || day === t ? ' open' : '') + '>' +
          '<summary><span>' + esc(dayLabel(day)) + '</span><b>' + (my.length ? my.map(function (s) { return hm(s.start) + '–' + hm(s.end); }).join(', ') : 'Repos') + '</b></summary>' +
          my.map(function (s) {
            return '<div class="portal__shift"><div>' + POSTES[s.poste] + (s.brk ? ' · pause ' + s.brk + ' min' : '') + (s.note ? ' · ' + esc(s.note) : '') +
              (s.status === 'a_remplacer' ? ' · <span class="badge badge--warn">proposé à l’équipe</span>' : s.status === 'propose' ? ' · <span class="badge badge--info">remplacement à valider</span>' : '') + '</div>' +
              (s.status === 'prevu' && s.day >= t ? '<button class="link-btn" type="button" data-release="' + esc(s.id) + '">Je ne peux pas</button>' : '') + '</div>';
          }).join('') +
          (team.length ? '<p class="portal__team"><span>Avec</span> ' + team.map(function (s) { return esc(name(s.staffId)) + ' <small>' + hm(s.start) + '–' + hm(s.end) + '</small>'; }).join(' · ') + '</p>' : '') +
        '</details>';
      }).join('') + '</div>' +
      (mine.filter(function (s) { return s.day >= t; }).length ? '<button class="btn btn--soft btn--block" type="button" data-ics style="margin-top:12px">📅 Ajouter mes services à mon agenda</button>' : '') +
      '</section>') +
      '<section class="chart-card"><div class="margins-head"><h3>Mes indisponibilités</h3><button class="btn btn--ghost btn--sm" type="button" data-unav>+ Ajouter</button></div>' +
        (d.unav.length ? '<div class="pl-mine">' + d.unav.map(function (u) {
          return '<div class="pl-mine__row"><div><strong>' + esc(dayLabel(u.day)) + '</strong><span>' + (u.start != null ? hm(u.start) + ' – ' + hm(u.end) : 'Toute la journée') + (u.reason ? ' · ' + esc(u.reason) : '') + '</span></div>' +
            '<span class="badge ' + (u.status === 'acceptee' ? 'badge--ok' : u.status === 'refusee' ? 'badge--danger' : 'badge--warn') + '">' + (u.status === 'acceptee' ? 'acceptée' : u.status === 'refusee' ? 'refusée' : 'en attente') + '</span>' +
            (u.status !== 'refusee' && u.day >= t ? '<button class="link-btn" type="button" data-cancel="' + esc(u.id) + '">Annuler</button>' : '') + '</div>';
        }).join('') + '</div>' : '<p class="help">Prévenez votre responsable à l’avance des jours où vous ne pouvez pas travailler.</p>') +
      '</section>' +
      '<p class="help portal__foot">Ce lien est personnel : ne le partagez pas. Astuce : ajoutez cette page à l’écran d’accueil de votre téléphone (Partager → « Sur l’écran d’accueil »).</p>';
  }

  function act(promise, msg) { promise.then(function () { UI.toast(msg); return load(); }, function (err) { UI.toast(esc(err.message), 5000); }); }

  function openUnav() {
    UI.openSheet({
      label: 'Indisponibilité',
      head: '<p class="eyebrow">' + esc(state.data.me.name) + '</p><h2>Je ne suis pas disponible</h2>',
      body: '<form id="unavForm" class="form-grid" novalidate>' +
        '<label class="field"><span>Jour</span><input name="day" type="date" value="' + addDays(today(), 1) + '" min="' + today() + '"></label>' +
        '<label class="field"><span>Quand</span><select name="when"><option value="day">Toute la journée</option><option value="hours">Seulement des heures</option></select></label>' +
        '<label class="field" data-hours hidden><span>De</span><input name="start" type="time" step="900" value="18:00"></label>' +
        '<label class="field" data-hours hidden><span>À</span><input name="end" type="time" step="900" value="23:00"></label>' +
        '<label class="field span-2"><span>Motif (facultatif)</span><input name="reason" maxlength="120" placeholder="Ex : examen, rendez-vous"></label></form>',
      footer: '<button class="btn btn--primary" type="submit" form="unavForm">Envoyer à mon responsable</button>',
      onMount: function (sheet) {
        var form = sheet.querySelector('#unavForm'), f = form.elements;
        f.when.addEventListener('change', function () { sheet.querySelectorAll('[data-hours]').forEach(function (el) { el.hidden = f.when.value !== 'hours'; }); });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!f.day.value) return UI.toast('Choisissez le jour');
          var x = { day: f.day.value, reason: f.reason.value.trim(), start: null, end: null };
          if (f.when.value === 'hours') { x.start = parseHm(f.start.value); x.end = parseHm(f.end.value); }
          UI.closeSheet(); act(T.portal.addUnav(token, x), 'Demande envoyée à votre responsable');
        });
      }
    });
  }

  function openRelease(id) {
    UI.openSheet({
      label: 'Je ne peux pas',
      head: '<h2>Je ne peux pas venir</h2>',
      body: '<form id="relForm" class="form-grid" novalidate><label class="field span-2"><span>Pourquoi ? (facultatif)</span><input name="reason" maxlength="120" placeholder="Ex : rendez-vous médical"></label>' +
        '<p class="help span-2">Le créneau est proposé à vos collègues ; votre responsable valide le remplacement. D’ici là, il reste à vous.</p></form>',
      footer: '<button class="btn btn--primary" type="submit" form="relForm">Proposer le créneau</button>',
      onMount: function (sheet) {
        var form = sheet.querySelector('#relForm');
        form.addEventListener('submit', function (e) {
          e.preventDefault(); UI.closeSheet(); act(T.portal.release(token, id, form.elements.reason.value.trim()), 'Créneau proposé à vos collègues');
        });
      }
    });
  }

  // Fichier agenda (.ics) des services à venir : heures locales, ouvert par l'agenda du téléphone.
  function downloadIcs() {
    var d = state.data, me = d.me, stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    var dt = function (day, min) { var x = new Date(day + 'T00:00:00'); x.setMinutes(min); return ymd(x).replace(/-/g, '') + 'T' + hm(min % 1440).replace(':', '') + '00'; };
    var ev = d.shifts.filter(function (s) { return s.staffId === me.id && s.day >= today(); }).map(function (s) {
      return ['BEGIN:VEVENT', 'UID:' + s.id + '@tapigo', 'DTSTAMP:' + stamp, 'DTSTART:' + dt(s.day, s.start), 'DTEND:' + dt(s.day, s.start + span(s)),
        'SUMMARY:' + (d.restaurant + ' · ' + POSTES[s.poste]).replace(/[,;]/g, ' '), 'DESCRIPTION:' + ((s.brk ? 'Pause ' + s.brk + ' min. ' : '') + (s.note || '')).replace(/[,;\n]/g, ' '),
        'END:VEVENT'].join('\r\n');
    });
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tapigo//Planning//FR', 'CALSCALE:GREGORIAN'].concat(ev).concat(['END:VCALENDAR']).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'mon-planning.ics';
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast('Ouvrez le fichier pour ajouter vos services à votre agenda', 4000);
  }

  root.addEventListener('click', function (e) {
    var w = e.target.closest('[data-week]');
    if (w) { state.week = w.dataset.week; return paint(); }
    var tk = e.target.closest('[data-take]');
    if (tk) return act(T.portal.take(token, tk.dataset.take), 'Proposé à votre responsable : il valide le remplacement');
    var rl = e.target.closest('[data-release]');
    if (rl) return openRelease(rl.dataset.release);
    if (e.target.closest('[data-unav]')) return openUnav();
    var c = e.target.closest('[data-cancel]');
    if (c) return act(T.portal.cancelUnav(token, c.dataset.cancel), 'Indisponibilité annulée');
    if (e.target.closest('[data-ics]')) return downloadIcs();
  });

  T.ready.then(function () {
    if (!token) { state.error = 'Ce lien est incomplet : ouvrez le lien envoyé par votre responsable.'; return paint(); }
    load();
    // Rafraîchi quand on revient sur la page (planning modifié entre-temps).
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  });
})();
