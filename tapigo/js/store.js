/* ==========================================================================
   Tapigo — Store (backend simulé)

   Toute la persistance passe par ce module : le menu client et le dashboard
   cuisine ne lisent / n'écrivent jamais localStorage directement.
   Pour passer en production, il suffit de réimplémenter cette API
   (mêmes noms de fonctions) au-dessus de Supabase, Firebase ou d'une API
   REST + WebSocket :

     getRestaurant()            -> GET  /api/restaurant
     getMenu()                  -> GET  /api/menu
     saveItem(item)             -> PUT  /api/menu/items/:id
     deleteItem(id)             -> DELETE /api/menu/items/:id
     getOrders()                -> GET  /api/orders?open=true
     createOrder(payload)       -> POST /api/orders   (après paiement Stripe)
     updateOrderStatus(id, s)   -> PATCH /api/orders/:id
     subscribe(fn)              -> WebSocket / Realtime channel

   En démo, la synchronisation temps réel entre onglets utilise
   BroadcastChannel (repli sur l'événement "storage").
   ========================================================================== */
(function () {
  'use strict';

  var DEMO = window.TAPIGO_DEMO;
  var NS = 'tapigo.v1.';
  var K = {
    restaurant: NS + 'restaurant',
    menu: NS + 'menu',
    orders: NS + 'orders',
    seq: NS + 'seq',
    requests: NS + 'requests',
    stock: NS + 'stock',
    forecast: NS + 'forecast',
    servers: NS + 'servers',
    expiry: NS + 'expiry'
  };

  var memory = {};
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch (e) { /* stockage indisponible : mémoire */ }
    return key in memory ? clone(memory[key]) : clone(fallback);
  }

  function write(key, value) {
    memory[key] = clone(value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  function remove(key) {
    delete memory[key];
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------------- Temps réel ---------------- */
  var listeners = [];
  var bc = null;
  try { bc = new BroadcastChannel('tapigo'); } catch (e) { bc = null; }

  function notify(msg, remote) {
    listeners.slice().forEach(function (fn) {
      try { fn(msg, remote); } catch (e) { console.error(e); }
    });
  }

  // En ligne, chaque onglet a son propre temps réel Supabase : le relais entre
  // onglets (utile en démo) créerait des doublons (alertes, sonneries).
  function isLive() { return window.Tapigo && window.Tapigo.mode === 'live'; }

  function emit(type, payload) {
    var msg = { type: type, payload: payload, at: Date.now() };
    notify(msg, false);
    if (bc && !isLive()) bc.postMessage(msg);
  }

  if (bc) {
    bc.onmessage = function (e) { if (!isLive()) notify(e.data, true); };
  } else {
    window.addEventListener('storage', function (e) {
      if (e.key === K.orders) notify({ type: 'orders:sync' }, true);
      if (e.key === K.requests) notify({ type: 'service:updated' }, true);
      if (e.key === K.stock) notify({ type: 'stock:updated' }, true);
      if (e.key === K.menu) notify({ type: 'menu:updated' }, true);
      if (e.key === K.restaurant) notify({ type: 'restaurant:updated' }, true);
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  /* ---------------- Statuts ---------------- */
  var STATUSES = [
    { id: 'nouvelle', label: 'Nouvelle', client: 'Commande envoyée en cuisine', hint: 'Le chef a bien reçu votre commande.' },
    { id: 'preparation', label: 'En préparation', client: 'En préparation', hint: 'Vos plats sont en cours de préparation.' },
    { id: 'prete', label: 'Prête', client: 'Prête à être servie', hint: 'Votre commande arrive à votre table.' },
    { id: 'servie', label: 'Servie', client: 'Servie', hint: 'Bon appétit !' },
    { id: 'terminee', label: 'Terminée', client: 'Terminée', hint: 'Merci de votre visite, à très bientôt.' }
  ];
  function statusInfo(id) {
    return STATUSES.filter(function (s) { return s.id === id; })[0] || STATUSES[0];
  }

  /* ---------------- Seed ---------------- */
  function seed() {
    write(K.restaurant, DEMO.restaurant);
    write(K.menu, { categories: DEMO.categories, tags: DEMO.tags, items: DEMO.items });
    write(K.seq, 1040);
    write(K.orders, []);

    // Quelques commandes pour que le dashboard ne soit pas vide.
    var now = Date.now();
    var demoOrders = [
      { table: 4, ago: 14, status: 'preparation', pay: 'card', lines: [
        ['entrecote', 2, { cuisson: ['Saignante'], accompagnement: ['Frites maison'], sauce: ['Béarnaise'] }, ''],
        ['bordeaux', 2, { contenance: ['Verre 12 cl'] }, '']
      ], note: '' },
      { table: 9, ago: 6, status: 'nouvelle', pay: 'onsite', lines: [
        ['burger', 1, { cuisson: ['À point'], accompagnement: ['Salade verte'], supplements: ['Bacon fumé'] }, 'Sans oignon'],
        ['citronnade', 1, {}, '']
      ], note: 'Allergie aux fruits à coque' },
      { table: 2, ago: 22, status: 'prete', pay: 'applepay', lines: [
        ['burrata', 1, {}, ''],
        ['risotto', 1, { truffe: ['Truffe noire râpée'] }, '']
      ], note: '' }
    ];
    demoOrders.forEach(function (d) {
      var o = createOrder({
        table: d.table,
        note: d.note,
        payment: { method: d.pay, status: d.pay === 'onsite' ? 'pending' : 'paid' },
        lines: d.lines.map(function (l) { return buildLine(l[0], l[1], l[2], l[3]); })
      }, { silent: true });
      var created = now - d.ago * 60000;
      patchOrder(o.id, function (ord) {
        ord.createdAt = created;
        ord.history = [{ status: 'nouvelle', at: created }];
        if (d.status !== 'nouvelle') ord.history.push({ status: d.status, at: created + 4 * 60000 });
        ord.status = d.status;
        ord.seen = true;
      });
    });
  }

  /* ---------------- Restaurant & Menu ---------------- */
  function getRestaurant() { return read(K.restaurant, DEMO.restaurant); }

  function saveRestaurant(r) {
    write(K.restaurant, r);
    emit('restaurant:updated', r);
  }

  function getMenu() {
    return read(K.menu, { categories: DEMO.categories, tags: DEMO.tags, items: DEMO.items });
  }

  function getItem(id) {
    return window.Tapigo.getMenu().items.filter(function (i) { return i.id === id; })[0] || null;
  }

  function slug(s) {
    return String(s || 'plat').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plat';
  }

  function saveItem(item) {
    var menu = getMenu();
    if (!item.id) {
      var base = slug(item.name), id = base, n = 2;
      while (menu.items.some(function (i) { return i.id === id; })) id = base + '-' + n++;
      item.id = id;
    }
    var idx = menu.items.findIndex(function (i) { return i.id === item.id; });
    if (idx >= 0) menu.items[idx] = item; else menu.items.push(item);
    write(K.menu, menu);
    emit('menu:updated', { id: item.id });
    return item;
  }

  function replaceMenu(menu) {
    write(K.menu, menu);
    emit('menu:updated', null);
    return Promise.resolve();
  }

  function deleteItem(id) {
    var menu = getMenu();
    menu.items = menu.items.filter(function (i) { return i.id !== id; });
    write(K.menu, menu);
    emit('menu:updated', { id: id });
  }

  function setAvailable(id, available) {
    var item = getItem(id);
    if (!item) return;
    item.available = !!available;
    saveItem(item);
  }

  /* ---------------- Commandes ---------------- */
  // selections : { groupId: [label, ...] }
  function buildLine(itemId, qty, selections, note) {
    var item = window.Tapigo.getItem(itemId);
    if (!item) return null;
    var unit = item.price;
    var options = [];
    (item.options || []).forEach(function (g) {
      var picked = (selections && selections[g.id]) || [];
      if (!picked.length) return;
      picked.forEach(function (label) {
        var c = g.choices.filter(function (ch) { return ch.label === label; })[0];
        if (c) unit += Number(c.price) || 0;
      });
      options.push({ group: g.name, values: picked.slice() });
    });
    return {
      itemId: item.id,
      name: item.name,
      station: item.station || 'cuisine',
      qty: qty,
      unitPrice: Math.round(unit * 100) / 100,
      options: options,
      selections: selections || {},
      note: note || ''
    };
  }

  function getOrders() { return read(K.orders, []); }

  function getOrder(id) {
    return getOrders().filter(function (o) { return o.id === id; })[0] || null;
  }

  function patchOrder(id, mutate) {
    var orders = getOrders();
    var o = orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return null;
    mutate(o);
    write(K.orders, orders);
    return o;
  }

  function getStock(id) { var m = read(K.stock, {}); return id in m ? m[id] : null; }
  function getStocks() { return read(K.stock, {}); }
  function setStock(id, quantity) {
    var m = read(K.stock, {});
    if (quantity == null) delete m[id]; else m[id] = quantity;
    write(K.stock, m);
    emit('stock:updated', { id: id, quantity: quantity });
    return Promise.resolve();
  }

  // Serveur attitré de chaque table : { '4': 'Marco' }.
  function getTableServers() { return read(K.servers, {}); }
  function getTableServer(table) { return getTableServers()[String(table)] || ''; }
  function setTableServers(tables, name) {
    var m = getTableServers();
    name = String(name || '').trim().slice(0, 40);
    tables.forEach(function (t) { if (name) m[String(t)] = name; else delete m[String(t)]; });
    write(K.servers, m);
    emit('servers:updated', null);
    return Promise.resolve();
  }

  function createOrder(payload, opts) {
    var lines = (payload.lines || []).filter(Boolean);
    // Stocks : vérifiés puis décrémentés.
    var stock = read(K.stock, {}), need = {};
    lines.forEach(function (l) { need[l.itemId] = (need[l.itemId] || 0) + l.qty; });
    Object.keys(need).forEach(function (id) {
      if (id in stock && stock[id] < need[id]) {
        var it = window.Tapigo.getItem(id);
        throw new Error(stock[id] === 0 ? '« ' + (it ? it.name : id) + ' » est épuisé' : 'Il ne reste que ' + stock[id] + ' « ' + (it ? it.name : id) + ' »');
      }
    });
    var touched = Object.keys(need).filter(function (id) { return id in stock; });
    touched.forEach(function (id) { stock[id] -= need[id]; });
    if (touched.length) {
      write(K.stock, stock);
      touched.forEach(function (id) { emit('stock:updated', { id: id, quantity: stock[id] }); });
    }
    var total = lines.reduce(function (s, l) { return s + l.unitPrice * l.qty; }, 0);
    var seq = read(K.seq, 1040) + 1;
    write(K.seq, seq);
    var now = Date.now();
    var order = {
      id: 'o_' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      number: seq,
      table: String(payload.table || '?'),
      lines: lines,
      note: payload.note || '',
      payment: payload.payment || { method: 'onsite', status: 'pending' },
      total: Math.round(total * 100) / 100,
      tip: Math.max(0, Math.round((Number(payload.tip) || 0) * 100) / 100),
      status: 'nouvelle',
      createdAt: now,
      history: [{ status: 'nouvelle', at: now }],
      seen: false,
      source: payload.source || 'client'
    };
    var orders = getOrders();
    orders.push(order);
    write(K.orders, orders);
    if (!(opts && opts.silent)) emit('order:created', order);
    return order;
  }

  function updateOrderStatus(id, status) {
    var o = patchOrder(id, function (ord) {
      if (ord.status === status) return;
      ord.status = status;
      ord.seen = true;
      ord.history.push({ status: status, at: Date.now() });
      if (status === 'terminee' && ord.payment.status === 'pending') ord.payment.status = 'paid';
    });
    if (o) emit('order:updated', o);
    return o;
  }

  function markSeen(id) {
    var o = patchOrder(id, function (ord) { ord.seen = true; });
    if (o) emit('order:updated', o);
  }

  /* ---------------- Appels du personnel (démo) ---------------- */
  function requestService(kind, table) {
    var list = read(K.requests, []);
    var open = list.filter(function (q) { return q.table_label === String(table) && q.kind === kind && !q.done_at; })[0];
    if (open) return Promise.resolve(open);
    var q = { id: 'q_' + Date.now().toString(36), table_label: String(table), kind: kind, created_at: new Date().toISOString(), done_at: null };
    list.push(q);
    write(K.requests, list);
    emit('service:created', q);
    return Promise.resolve(q);
  }

  function getServiceRequests() {
    return read(K.requests, []).filter(function (q) { return !q.done_at; });
  }

  function completeServiceRequest(id) {
    var list = read(K.requests, []).map(function (q) {
      if (q.id === id) q.done_at = new Date().toISOString();
      return q;
    });
    write(K.requests, list);
    emit('service:updated', null);
  }

  function closeTable(table) {
    getOrders().forEach(function (o) {
      if (o.table === String(table) && o.status !== 'terminee') updateOrderStatus(o.id, 'terminee');
    });
    read(K.requests, []).forEach(function (q) {
      if (q.table_label === String(table) && !q.done_at) completeServiceRequest(q.id);
    });
    return Promise.resolve();
  }

  function setOrdersPaused(paused) {
    var info = getRestaurant();
    if (paused) info.ordersPaused = true; else delete info.ordersPaused;
    saveRestaurant(info);
  }

  function loadStats(days) {
    var since = Date.now() - days * 24 * 3600 * 1000;
    return Promise.resolve(getOrders().filter(function (o) { return o.createdAt >= since; }));
  }

  // Prévision de stock du jour. En démo : base statistique calculée ici
  // (en ligne, la fonction serveur stock-forecast y ajoute l'analyse de Claude).
  var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function computeForecast(context) {
    var today = dayKey(Date.now());
    var wd = new Date().getDay();
    var sold = {}, open = {};
    getOrders().forEach(function (o) {
      var k = dayKey(o.createdAt);
      if (k >= today || Date.now() - o.createdAt > 57 * 864e5) return;
      open[k] = new Date(o.createdAt).getDay();
      o.lines.forEach(function (l) {
        sold[l.itemId] = sold[l.itemId] || {};
        sold[l.itemId][k] = (sold[l.itemId][k] || 0) + l.qty;
      });
    });
    var days = Object.keys(open).sort();
    var same = days.filter(function (k) { return open[k] === wd; }).slice(-8);
    var recent = days.slice(-14);
    var items = [];
    getMenu().items.forEach(function (it) {
      var s = sold[it.id];
      if (!s) return;
      var avg, reason;
      if (same.length >= 2) {
        var w = 0, sum = 0;
        same.forEach(function (k, i) { sum += (s[k] || 0) * (i + 1); w += i + 1; });
        avg = sum / w;
        reason = 'Moyenne des ' + same.length + ' derniers ' + DAYS[wd] + 's';
      } else {
        avg = recent.reduce(function (a, k) { return a + (s[k] || 0); }, 0) / Math.max(1, recent.length);
        reason = 'Moyenne des ' + recent.length + ' derniers jours d’ouverture';
      }
      if (avg > 0) items.push({ itemId: it.id, quantity: Math.ceil(avg * 1.15), reason: reason + ' (' + avg.toFixed(1).replace('.', ',') + ') + 15 % de marge' });
    });
    var f = {
      for_date: today,
      items: items,
      summary: days.length
        ? 'Prévision statistique pour ce ' + DAYS[wd] + ', basée sur ' + days.length + ' jours de ventes. En ligne, l’IA affine ces quantités et les explique.'
        : 'Pas encore assez de ventes pour une prévision. En démo, générez des commandes fictives depuis l’onglet Statistiques.',
      alerts: [],
      context: String(context || '').slice(0, 300),
      source: 'statistique',
      created_at: new Date().toISOString()
    };
    write(K.forecast, f);
    return f;
  }
  var forecast = {
    get: function () {
      var f = read(K.forecast, null);
      return Promise.resolve(f && f.for_date === dayKey(Date.now()) ? f : null);
    },
    run: function (context) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(computeForecast(context)); }, 500); });
    }
  };

  // En démo, la photo est gardée dans le navigateur (image réduite).
  function uploadPhoto(file) {
    return window.TapigoUI.compressImage(file, 640, 0.75).then(function (blob) {
      return new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.readAsDataURL(blob);
      });
    });
  }

  // Commandes passées fictives pour voir les statistiques en démo.
  /* ---------------- Dates limites (DLC / DDM), démo ---------------- */
  function isoDay(offset) {
    var d = new Date(); d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function expiryList() {
    var list = read(K.expiry, null);
    if (!list) {
      // Quelques produits datés pour la démonstration.
      list = [
        ['cuisine', 'Burrata des Pouilles', 'dlc', -1, '3 pièces'], ['cuisine', 'Crème liquide 35 %', 'dlc', 0, '1 L'],
        ['cuisine', 'Saumon frais (tartare)', 'dlc', 1, '1,2 kg'], ['cuisine', 'Pâte feuilletée', 'dlc', 4, '2 rouleaux'],
        ['bar', 'Lait entier', 'dlc', 2, '3 bouteilles'], ['bar', 'Citrons (citronnade)', 'ddm', 5, '2 kg'],
        ['bar', 'Sirop de framboise', 'ddm', 60, '1 bouteille'], ['bar', 'Prosecco ouvert', 'ddm', 1, '1 bouteille', 'Ouvert hier']
      ].map(function (x, i) {
        return { id: 'exp_demo_' + i, station: x[0], label: x[1], itemId: null, kind: x[2], expiresOn: isoDay(x[3]), quantity: x[4], note: x[5] || '', status: 'actif', closedAt: null };
      });
      write(K.expiry, list);
    }
    return list;
  }
  var expiry = {
    station: function () { return 'all'; },
    list: function () { return clone(expiryList()); },
    add: function (e) {
      var list = expiryList();
      var row = { id: 'exp_' + Date.now().toString(36), station: e.station, label: e.label, itemId: e.itemId || null, kind: e.kind,
        expiresOn: e.expiresOn, quantity: e.quantity || '', note: e.note || '', status: 'actif', closedAt: null };
      list.push(row); write(K.expiry, list); emit('expiry:updated', null);
      return Promise.resolve(clone(row));
    },
    close: function (id, status) {
      var list = expiryList().filter(function (x) { return status !== 'supprime' || x.id !== id; });
      list.forEach(function (x) { if (x.id === id && status !== 'supprime') { x.status = status; x.closedAt = Date.now(); } });
      write(K.expiry, list); emit('expiry:updated', null);
      return Promise.resolve();
    }
  };

  function seedDemoOrders(days) {
    var items = window.Tapigo.getMenu().items.filter(function (i) { return i.available !== false; });
    if (!items.length) return 0;
    var orders = getOrders();
    var seq = read(K.seq, 1040);
    var tables = getRestaurant().tables || 12;
    var count = 0;
    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    for (var d = days; d >= 1; d--) {
      var day = new Date(); day.setDate(day.getDate() - d);
      var n = 6 + Math.floor(Math.random() * 10) + ([0, 5, 6].indexOf(day.getDay()) >= 0 ? 8 : 0);
      for (var k = 0; k < n; k++) {
        var at = new Date(day);
        if (Math.random() < 0.45) at.setHours(12, 0, 0, 0); else at.setHours(19, 0, 0, 0);
        at = at.getTime() + Math.random() * 150 * 60000;
        var lines = [];
        for (var j = 0, m = 1 + Math.floor(Math.random() * 4); j < m; j++) {
          var it = pick(items), sel = {};
          (it.options || []).forEach(function (g) { if (g.required) sel[g.id] = [pick(g.choices).label]; });
          var bl = buildLine(it.id, Math.random() < 0.25 ? 2 : 1, sel, '');
          if (j > 0 && Math.random() < 0.12) bl.suggested = bl.qty; // ajouté depuis « Parfait avec »
          lines.push(bl);
        }
        var prep = 8 + Math.floor(Math.random() * 14);
        orders.push({
          id: 'demo_' + at.toString(36) + k, number: ++seq, table: String(1 + Math.floor(Math.random() * tables)),
          lines: lines, note: '', payment: { method: 'onsite', status: 'paid', demo: true },
          total: Math.round(lines.reduce(function (s, l) { return s + l.unitPrice * l.qty; }, 0) * 100) / 100,
          status: 'terminee', createdAt: at, seen: true,
          history: [
            { status: 'nouvelle', at: at }, { status: 'preparation', at: at + 120000 },
            { status: 'prete', at: at + prep * 60000 }, { status: 'servie', at: at + (prep + 3) * 60000 },
            { status: 'terminee', at: at + (prep + 45) * 60000 }
          ]
        });
        count++;
      }
    }
    write(K.seq, seq);
    write(K.orders, orders);
    emit('orders:sync', null);
    return count;
  }

  function clearDemoOrders() {
    write(K.orders, getOrders().filter(function (o) { return !(o.payment && o.payment.demo); }));
    emit('orders:sync', null);
  }

  function resetDemo() {
    Object.keys(K).forEach(function (k) { remove(K[k]); });
    seed();
    emit('demo:reset', null);
  }

  /* ---------------- Helpers partagés ---------------- */
  var money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  function fmt(n) { return money.format(Number(n) || 0); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe');
  }

  // Allergènes d'un plat : liste cochée, sinon détectés dans l'ancien texte libre.
  function itemAllergens(item) {
    var all = (DEMO && DEMO.allergens) || [];
    if (item.allergenList && item.allergenList.length) {
      return all.filter(function (a) { return item.allergenList.indexOf(a.id) >= 0; });
    }
    var text = norm(item.allergens);
    if (!text) return [];
    return all.filter(function (a) {
      var l = norm(a.label);
      return text.indexOf(l) >= 0 || (a.id === 'oeufs' && /\boeufs?\b/.test(text)) ||
        (a.id === 'poissons' && /\bpoisson/.test(text)) || (a.id === 'mollusques' && /mollusque/.test(text));
    });
  }

  function clock(ts) {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function minutesSince(ts) { return Math.max(0, Math.floor((Date.now() - ts) / 60000)); }

  window.Tapigo = {
    mode: 'demo',
    ready: Promise.resolve(),
    track: function () { return Promise.resolve(); },
    _emit: emit,
    _slug: slug,
    STATUSES: STATUSES,
    statusInfo: statusInfo,
    subscribe: subscribe,
    getRestaurant: getRestaurant,
    saveRestaurant: saveRestaurant,
    getMenu: getMenu,
    getItem: getItem,
    saveItem: saveItem,
    deleteItem: deleteItem,
    replaceMenu: replaceMenu,
    setAvailable: setAvailable,
    buildLine: buildLine,
    getOrders: getOrders,
    getOrder: getOrder,
    createOrder: createOrder,
    updateOrderStatus: updateOrderStatus,
    markSeen: markSeen,
    resetDemo: resetDemo,
    requestService: requestService,
    getStock: getStock,
    getStocks: getStocks,
    setStock: setStock,
    getServiceRequests: getServiceRequests,
    completeServiceRequest: completeServiceRequest,
    closeTable: closeTable,
    setOrdersPaused: setOrdersPaused,
    loadStats: loadStats,
    forecast: forecast,
    expiry: expiry,
    getTableServers: getTableServers,
    getTableServer: getTableServer,
    setTableServers: setTableServers,
    canPayOnline: function () { return false; },
    uploadPhoto: uploadPhoto,
    seedDemoOrders: seedDemoOrders,
    clearDemoOrders: clearDemoOrders,
    read: read,
    write: write,
    fmt: fmt,
    esc: esc,
    clock: clock,
    itemAllergens: itemAllergens,
    minutesSince: minutesSince
  };

  if (!read(K.menu, null)) seed();
})();
