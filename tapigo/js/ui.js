/* ==========================================================================
   Tapigo — Composants UI partagés (sheet, toast, icônes, son, images)
   ========================================================================== */
(function () {
  'use strict';

  var ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="draw" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chef: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.9A4 4 0 1 1 8.2 6.3a4.5 4.5 0 0 1 7.6 0A4 4 0 1 1 18 13.9V20H6z"/><path d="M6 17h12"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    tray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 8V6M10 6h4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    nfc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 8.3a6 6 0 0 1 0 7.4M9.5 6a10 10 0 0 1 0 12M13 3.7a14 14 0 0 1 0 16.6"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/></svg>',
    apple: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-3.8zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><circle cx="16.5" cy="14" r="1.2" fill="currentColor"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
  };

  /* Repli élégant quand une photo ne charge pas (hors-ligne, URL cassée). */
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.parentElement && t.parentElement.classList.contains('media')) {
      t.parentElement.classList.add('is-broken');
    }
  }, true);

  function media(item, cls) {
    var e = Tapigo.esc;
    return '<div class="media ' + (cls || '') + '" data-emoji="' + e(item.emoji || '🍽️') + '">' +
      (item.image ? '<img src="' + e(item.image) + '" alt="" loading="lazy" decoding="async">' : '') +
      '</div>';
  }

  /* ---------------- Toasts ---------------- */
  var stack;
  function toast(html, ms) {
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span>' + html + '</span>';
    stack.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 300);
    }, ms || 2600);
  }

  /* ---------------- Bottom sheet / modale ---------------- */
  var current = null;

  function closeSheet() {
    if (!current) return Promise.resolve();
    var c = current;
    current = null;
    document.removeEventListener('keydown', c.onKey);
    c.sheet.classList.add('is-closing');
    c.backdrop.classList.add('is-closing');
    return new Promise(function (resolve) {
      setTimeout(function () {
        c.sheet.remove();
        c.backdrop.remove();
        document.body.style.overflow = '';
        if (c.opts.onClose) c.opts.onClose();
        if (c.returnFocus && c.returnFocus.focus) c.returnFocus.focus({ preventScroll: true });
        resolve();
      }, 260);
    });
  }

  /* opts: { label, head (html), body (html), footer (html), media (html), onMount(sheetEl), onClose } */
  function openSheet(opts) {
    var returnFocus = document.activeElement;
    var go = function () {
      var backdrop = document.createElement('div');
      backdrop.className = 'sheet-backdrop';
      var sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-label', opts.label || 'Fenêtre');
      sheet.innerHTML =
        '<div class="sheet__grip" aria-hidden="true"></div>' +
        '<button class="icon-btn sheet__close" type="button" aria-label="Fermer">' + ICONS.close + '</button>' +
        '<div class="sheet__scroll">' +
          (opts.media || '') +
          (opts.head ? '<div class="sheet__head">' + opts.head + '</div>' : '') +
          '<div class="sheet__body">' + (opts.body || '') + '</div>' +
        '</div>' +
        (opts.footer ? '<div class="sheet__footer">' + opts.footer + '</div>' : '');

      document.body.appendChild(backdrop);
      document.body.appendChild(sheet);
      document.body.style.overflow = 'hidden';

      var onKey = function (e) { if (e.key === 'Escape') closeSheet(); };
      document.addEventListener('keydown', onKey);
      backdrop.addEventListener('click', closeSheet);
      sheet.querySelector('.sheet__close').addEventListener('click', closeSheet);
      enableDrag(sheet);

      current = { sheet: sheet, backdrop: backdrop, opts: opts, onKey: onKey, returnFocus: returnFocus };
      if (opts.onMount) opts.onMount(sheet);
      setTimeout(function () {
        var f = sheet.querySelector('[autofocus]') || sheet.querySelector('.sheet__close');
        if (f) f.focus({ preventScroll: true });
      }, 50);
    };
    if (current) closeSheet().then(go); else go();
  }

  /* Glisser vers le bas pour fermer (mobile). */
  function enableDrag(sheet) {
    var grip = sheet.querySelector('.sheet__grip');
    var startY = 0, dy = 0, dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true; startY = e.clientY; dy = 0;
      sheet.style.transition = 'none';
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = 'translate(-50%, ' + dy + 'px)';
    });
    var end = function () {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = 'transform .25s cubic-bezier(.22,.8,.24,1)';
      if (dy > 110) {
        sheet.style.transform = 'translate(-50%, 100%)';
        setTimeout(function () { sheet.style.transform = ''; closeSheet(); }, 200);
      } else {
        sheet.style.transform = '';
      }
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  /* ---------------- Son (Web Audio, aucun fichier requis) ---------------- */
  var ctx = null;
  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function chime() {
    var a = audio();
    if (!a) return;
    var t = a.currentTime;
    [[880, 0], [1174.66, .16], [1567.98, .32]].forEach(function (n) {
      var o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t + n[1]);
      g.gain.exponentialRampToValueAtTime(0.28, t + n[1] + .02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + .6);
      o.connect(g); g.connect(a.destination);
      o.start(t + n[1]); o.stop(t + n[1] + .65);
    });
  }

  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  /* ---------------- Réduction des photos avant envoi ---------------- */
  // Redimensionne (côté le plus long = maxSize) et convertit en JPEG.
  function compressImage(file, maxSize, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Choisissez une image (JPEG, PNG…)'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('Image illisible'));
        }, 'image/jpeg', quality || 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      img.src = url;
    });
  }

  /* ---------------- Mon compte (mode en ligne) ---------------- */
  // opts : { onSwitch: fn | null, onLogout: fn }
  function openAccount(opts) {
    opts = opts || {};
    var T = window.Tapigo, esc = T.esc;
    T.auth.session().then(function (session) {
      var email = session && session.user ? session.user.email : '';
      openSheet({
        label: 'Mon compte',
        head: '<p class="eyebrow">' + esc(email) + '</p><h2>Mon compte</h2>',
        body:
          '<form id="pwForm" class="form-grid" novalidate>' +
            '<label class="field span-2"><span>Nouveau mot de passe</span><input type="password" name="pw" autocomplete="new-password" minlength="8" required></label>' +
            '<label class="field span-2"><span>Confirmer le mot de passe</span><input type="password" name="pw2" autocomplete="new-password" required></label>' +
            '<p class="help span-2">8 caractères minimum.</p>' +
            '<button class="btn btn--primary span-2" type="submit">Changer le mot de passe</button>' +
          '</form>' +
          (opts.onSwitch ? '<button class="btn btn--ghost btn--block" type="button" id="accSwitch">Changer de restaurant</button>' : '') +
          '<button class="btn btn--danger btn--block" type="button" id="accLogout">Se déconnecter</button>',
        onMount: function (sheet) {
          sheet.querySelector('#pwForm').addEventListener('submit', function (e) {
            e.preventDefault();
            var f = e.target.elements;
            if (f.pw.value.length < 8) return toast('Mot de passe trop court (8 caractères minimum)');
            if (f.pw.value !== f.pw2.value) return toast('Les deux mots de passe ne correspondent pas');
            var btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true;
            T.auth.changePassword(f.pw.value).then(function () {
              closeSheet();
              toast('Mot de passe modifié');
            }).catch(function (err) {
              btn.disabled = false;
              toast(esc(err.message), 4500);
            });
          });
          var sw = sheet.querySelector('#accSwitch');
          if (sw) sw.addEventListener('click', opts.onSwitch);
          sheet.querySelector('#accLogout').addEventListener('click', function () {
            if (opts.onLogout) opts.onLogout();
            T.auth.signOut().then(function () { location.href = location.pathname; });
          });
        }
      });
    });
  }

  window.TapigoUI = {
    openAccount: openAccount,
    compressImage: compressImage,
    ICONS: ICONS,
    media: media,
    toast: toast,
    openSheet: openSheet,
    closeSheet: closeSheet,
    unlockAudio: audio,
    chime: chime,
    vibrate: vibrate
  };
})();
