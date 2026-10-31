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
    expiry: NS + 'expiry',
    moves: NS + 'expiry-moves',
    margins: NS + 'margins.v2',
    haccp: NS + 'haccp',
    suppliers: NS + 'suppliers',
    planning: NS + 'planning'
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
    write(K.menu, { categories: DEMO.categories, tags: DEMO.tags, items: DEMO.items, i18n: DEMO.i18n || {} });
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

  /* ---------------- Anti-gaspillage ---------------- */
  // Mise en avant d'un plat par le gérant : { pct (remise en %, 0 = mise en avant seule), until (ISO) }.
  // Le serveur applique la même règle au moment de la commande.
  function promoOf(item) {
    var p = item && item.promo;
    if (!p || !p.until || !(Date.parse(p.until) > Date.now())) return null;
    return { pct: Math.max(0, Math.min(70, parseInt(p.pct, 10) || 0)), until: p.until };
  }
  function itemPrice(item) {
    var p = promoOf(item);
    return p && p.pct ? Math.round(item.price * (100 - p.pct)) / 100 : item.price;
  }

  /* ---------------- Commandes ---------------- */
  // selections : { groupId: [label, ...] }
  function buildLine(itemId, qty, selections, note) {
    var item = window.Tapigo.getItem(itemId);
    if (!item) return null;
    var unit = itemPrice(item), promo = promoOf(item);
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
      note: note || '',
      antigaspi: !!promo,
      promo: promo ? promo.pct : 0
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
    if (quantity != null) followStock(id, quantity);
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
    touched.forEach(function (id) { stock[id] -= need[id]; followStock(id, stock[id]); });
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
  // Comme en ligne : quand le stock d'un produit baisse, ses lots datés sont décomptés,
  // le plus proche de sa date d'abord ; un lot à 0 passe en « utilisé ».
  function followStock(itemId, quantity) {
    var list = read(K.expiry, null);
    if (!list) return;
    var lots = list.filter(function (x) { return x.itemId === itemId && x.status === 'actif' && x.portions != null; });
    var excess = lots.reduce(function (s, x) { return s + x.portions; }, 0) - quantity;
    if (excess <= 0) return;
    lots.sort(function (a, b) { return a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : 0; }).forEach(function (x) {
      if (excess <= 0) return;
      var take = Math.min(x.portions, excess);
      x.portions -= take; excess -= take;
      if (!x.portions) { x.status = 'utilise'; x.closedAt = Date.now(); }
    });
    write(K.expiry, list);
    emit('expiry:updated', null);
  }

  var UNIT_BASE = { kg: 1000, l: 100 };
  function unitFamily(u) { return u === 'g' || u === 'kg' ? 'masse' : u === 'cl' || u === 'l' ? 'volume' : u; }
  var expiry = {
    station: function () { return 'all'; },
    move: function (id, kind, amount, unit, reason, all) {
      var list = expiryList(), x = list.filter(function (y) { return y.id === id; })[0];
      if (!x || x.status !== 'actif') return Promise.reject(new Error('Ce lot est déjà clos.'));
      if (x.portions != null) {
        unit = 'portion';
        amount = all ? x.portions : Math.round(amount || 0);
        if (amount < 1) return Promise.reject(new Error('Indiquez le nombre de portions'));
        if (amount > x.portions) return Promise.reject(new Error('Il ne reste que ' + x.portions + ' portion(s) dans ce lot'));
        x.portions -= amount;
        if (!x.portions) { x.status = kind; x.closedAt = Date.now(); }
      } else {
        if (all && x.amount != null) { amount = x.amount; unit = x.unit; }
        if (!(amount > 0)) return Promise.reject(new Error('Indiquez la quantité'));
        if (x.amount != null) {
          if (unitFamily(unit) !== unitFamily(x.unit)) return Promise.reject(new Error('Ce lot se compte en ' + x.unit));
          var left = (x.amount * (UNIT_BASE[x.unit] || 1) - amount * (UNIT_BASE[unit] || 1)) / (UNIT_BASE[x.unit] || 1);
          if (left < -0.0005) return Promise.reject(new Error('Il ne reste que ' + x.amount + ' ' + x.unit + ' dans ce lot'));
          x.amount = Math.max(0, Math.round(left * 1000) / 1000);
          if (!x.amount || all) { x.status = kind; x.closedAt = Date.now(); }
        } else if (all) { x.status = kind; x.closedAt = Date.now(); }
      }
      write(K.expiry, list);
      var item = x.itemId && getItem(x.itemId);
      var moves = read(K.moves, []);
      moves.unshift({ id: 'mv_' + Date.now().toString(36), station: x.station, label: x.label, itemId: x.itemId, kind: kind, amount: amount, unit: unit,
        value: unit === 'portion' && item ? Math.round(item.price * amount * 100) / 100 : null,
        cost: x.unitCost != null ? Math.round(amount * (UNIT_BASE[unit] || 1) / (UNIT_BASE[x.unit] || 1) * x.unitCost * 100) / 100 : null,
        reason: kind === 'jete' ? (reason || '') : '', at: Date.now() });
      write(K.moves, moves);
      if (kind === 'jete' && unit === 'portion' && x.itemId) {
        var st = getStock(x.itemId);
        if (st != null) setStock(x.itemId, Math.max(0, st - amount));
      }
      emit('expiry:updated', null);
      return Promise.resolve();
    },
    moves: function (days) {
      var since = Date.now() - days * 86400000;
      return Promise.resolve(read(K.moves, []).filter(function (m) { return m.at >= since; }));
    },
    list: function () { return clone(expiryList()); },
    add: function (e) {
      var list = expiryList();
      var row = { id: 'exp_' + Date.now().toString(36), station: e.station, label: e.label, itemId: e.itemId || null, kind: e.kind,
        expiresOn: e.expiresOn, quantity: e.quantity || '', note: e.note || '', status: 'actif', closedAt: null,
        portions: e.itemId && e.portions > 0 ? e.portions : null,
        amount: !(e.itemId && e.portions > 0) && e.amount > 0 ? e.amount : null, unit: !(e.itemId && e.portions > 0) && e.amount > 0 ? e.unit : null };
      if (row.portions) row.unit = 'portion';
      row.unitCost = e.unitCost >= 0 && e.unitCost != null ? e.unitCost : null;
      list.push(row); write(K.expiry, list); emit('expiry:updated', null);
      return Promise.resolve(clone(row));
    },
    close: function (id, status) {
      var list = expiryList().filter(function (x) { return status !== 'supprime' || x.id !== id; });
      var thrown = null;
      list.forEach(function (x) { if (x.id === id && status !== 'supprime') { x.status = status; x.closedAt = Date.now(); if (status === 'jete') thrown = x; } });
      write(K.expiry, list); emit('expiry:updated', null);
      // Lot jeté : ses portions restantes sortent aussi du stock.
      if (thrown && thrown.itemId && thrown.portions > 0) {
        var st = getStock(thrown.itemId);
        if (st != null) setStock(thrown.itemId, Math.max(0, st - thrown.portions));
      }
      return Promise.resolve();
    }
  };

  /* ---------------- Fiches techniques et marges, démo ---------------- */
  function marginsData() {
    var m = read(K.margins, null);
    if (!m) {
      var ing = function (id, name, unit, cost, prev) {
        return { id: id, name: name, unit: unit, cost: cost, prevCost: prev || null, costUpdatedAt: Date.now() - 86400000 * (prev ? 3 : 20), source: 'bon' };
      };
      m = {
        ingredients: [
          ing('i_prosecco', 'Prosecco DOC', 'l', 8.67, 7.9), ing('i_aperol', 'Aperol', 'l', 19.86), ing('i_eau', 'Eau gazeuse', 'l', 0.8),
          ing('i_orange', 'Oranges', 'kg', 2.4), ing('i_boeuf', 'Bœuf haché', 'kg', 14.5), ing('i_pain', 'Pain burger', 'piece', 0.45),
          ing('i_cheddar', 'Cheddar', 'kg', 16.2, 15.1), ing('i_frites', 'Frites surgelées', 'kg', 2.1), ing('i_entrecote', 'Entrecôte maturée', 'kg', 32.5),
          ing('i_citron', 'Citrons jaunes', 'kg', 2.9), ing('i_sucre', 'Sucre de canne', 'kg', 1.6),
          ing('i_bacon', 'Bacon fumé', 'kg', 13.9), ing('i_oeuf', 'Œufs plein air', 'piece', 0.32), ing('i_truffe', 'Purée truffée', 'kg', 9.8)
        ],
        recipes: {}, itemCosts: { burrata: 2.85 }
      };
      var rec = function (id, vat, lines, options) { m.recipes[id] = { mode: 'recette', vat: vat, lines: lines, purchaseCost: null, options: options || [] }; };
      var o = function (group, choice, lines) { return { group: group, choice: choice, lines: lines }; };
      var l = function (i, q, u) { return { ingredientId: i, qty: q, unit: u }; };
      rec('spritz', 20, [l('i_prosecco', 9, 'cl'), l('i_aperol', 6, 'cl'), l('i_eau', 3, 'cl'), l('i_orange', 30, 'g')]);
      rec('burger', 10, [l('i_boeuf', 180, 'g'), l('i_pain', 1, 'piece'), l('i_cheddar', 30, 'g')], [
        o('Accompagnement', 'Frites maison', [l('i_frites', 200, 'g')]), o('Accompagnement', 'Purée à la truffe', [l('i_truffe', 180, 'g')]),
        o('Suppléments', 'Bacon fumé', [l('i_bacon', 40, 'g')]), o('Suppléments', 'Cheddar affiné', [l('i_cheddar', 30, 'g')]), o('Suppléments', 'Œuf au plat', [l('i_oeuf', 1, 'piece')])
      ]);
      rec('entrecote', 10, [l('i_entrecote', 300, 'g')], [o('Accompagnement', 'Frites maison', [l('i_frites', 200, 'g')]), o('Accompagnement', 'Purée à la truffe', [l('i_truffe', 180, 'g')])]);
      rec('citronnade', 10, [l('i_citron', 80, 'g'), l('i_sucre', 20, 'g')]);
      write(K.margins, m);
    }
    return m;
  }
  // Planning de démonstration : 6 personnes, semaine en cours publiée, suivante en brouillon.
  function ymdLocal(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function ymdPlus(ymd, n) { var d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return ymdLocal(d); }
  function mondayOf(d) { var x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymdLocal(x); }
  function planningData() {
    var p = read(K.planning, null);
    if (p) return p;
    var staff = [
      { id: 'st1', name: 'Léa', poste: 'bar', weeklyHours: 35, active: true },
      { id: 'st2', name: 'Hugo', poste: 'salle', weeklyHours: 35, active: true },
      { id: 'st3', name: 'Inès', poste: 'salle', weeklyHours: 24, active: true },
      { id: 'st4', name: 'Sami', poste: 'cuisine', weeklyHours: 39, active: true },
      { id: 'st5', name: 'Karim', poste: 'cuisine', weeklyHours: 35, active: true },
      { id: 'st6', name: 'Chloé', poste: 'bar', weeklyHours: 20, active: true }
    ];
    var priv = { st1: { hourlyCost: 16.5, pin: '1234' }, st2: { hourlyCost: 15.8, pin: '1111' }, st3: { hourlyCost: 15.2, pin: null },
      st4: { hourlyCost: 18.9, pin: null }, st5: { hourlyCost: 16.4, pin: null }, st6: { hourlyCost: 15.2, pin: null } };
    // [staff, jour 0=lundi, début, fin, pause, poste]
    var pattern = [
      ['st1', 1, 17 * 60, 120, 30, 'bar'], ['st1', 2, 17 * 60, 120, 30, 'bar'], ['st1', 4, 18 * 60, 120, 30, 'bar'], ['st1', 5, 18 * 60, 180, 30, 'bar'], ['st1', 6, 11 * 60, 17 * 60, 30, 'bar'],
      ['st6', 3, 17 * 60, 0, 0, 'bar'], ['st6', 4, 19 * 60, 120, 0, 'bar'], ['st6', 5, 19 * 60, 180, 30, 'bar'],
      ['st2', 0, 11 * 60, 15 * 60, 0, 'salle'], ['st2', 1, 11 * 60, 15 * 60, 0, 'salle'], ['st2', 2, 18 * 60, 0, 30, 'salle'], ['st2', 4, 18 * 60, 60, 30, 'salle'], ['st2', 5, 18 * 60, 60, 30, 'salle'], ['st2', 6, 11 * 60, 16 * 60, 30, 'salle'],
      ['st3', 3, 18 * 60, 0, 30, 'salle'], ['st3', 4, 11 * 60, 15 * 60, 0, 'salle'], ['st3', 5, 11 * 60, 15 * 60, 0, 'salle'], ['st3', 6, 18 * 60, 23 * 60, 0, 'salle'],
      ['st4', 0, 10 * 60, 15 * 60, 30, 'cuisine'], ['st4', 1, 10 * 60, 15 * 60, 30, 'cuisine'], ['st4', 2, 17 * 60, 23 * 60, 30, 'cuisine'], ['st4', 4, 17 * 60, 23 * 60 + 30, 30, 'cuisine'], ['st4', 5, 10 * 60, 23 * 60 + 30, 60, 'cuisine'],
      ['st5', 2, 10 * 60, 15 * 60, 30, 'cuisine'], ['st5', 3, 10 * 60, 23 * 60, 60, 'cuisine'], ['st5', 4, 10 * 60, 15 * 60, 30, 'cuisine'], ['st5', 6, 10 * 60, 23 * 60, 60, 'cuisine']
    ];
    var week = mondayOf(new Date()), next = ymdPlus(week, 7), shifts = [], n = 0;
    [week, next].forEach(function (w) {
      pattern.forEach(function (x) {
        shifts.push({ id: 'sh' + (++n), staffId: x[0], day: ymdPlus(w, x[1]), start: x[2], end: x[3], brk: x[4], poste: x[5], note: '', status: 'prevu', swapReason: '', proposedStaff: null });
      });
    });
    // Un créneau à remplacer la semaine en cours, une indisponibilité à valider la semaine suivante.
    var later = shifts.filter(function (x) { return x.day >= ymdLocal(new Date()) && x.staffId === 'st2'; })[0];
    if (later) { later.status = 'a_remplacer'; later.swapReason = 'Rendez-vous médical'; }
    var weeks = {}; weeks[week] = Date.now() - 3 * 86400000;
    p = { staff: staff, priv: priv, shifts: shifts, weeks: weeks,
      unav: [{ id: 'un1', staffId: 'st3', day: ymdPlus(next, 5), start: null, end: null, reason: 'Examen', status: 'en_attente' }],
      punches: [] };
    write(K.planning, p);
    return p;
  }
  function planningSave(p) { write(K.planning, p); }
  function planningFind(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
  function planningPin(p, staffId, pin, manager) {
    var pv = p.priv[staffId] || {};
    if (!manager && pv.pin && pv.pin !== pin) throw new Error('Code PIN incorrect');
  }
  var planning = {
    // En démo, `asTeam` simule la vue d'un compte équipe (semaines publiées seulement, code PIN demandé).
    asTeam: false,
    load: function (week) {
      var p = planningData(), from = ymdPlus(week, -1), to = ymdPlus(week, 7), today = ymdLocal(new Date());
      var team = planning.asTeam, published = p.weeks[week] || null;
      var visible = function (x) { return !team || p.weeks[mondayOf(new Date(x.day + 'T12:00:00'))]; };
      return Promise.resolve(clone({
        staff: p.staff.map(function (x) {
          var pv = p.priv[x.id] || {};
          return Object.assign({}, x, { hourlyCost: team ? null : (pv.hourlyCost == null ? null : pv.hourlyCost), hasPin: !team && !!pv.pin });
        }),
        shifts: p.shifts.filter(function (x) { return x.day >= from && x.day < to && visible(x); }),
        published: published,
        unav: p.unav.filter(function (x) { return x.day >= from && x.day < to; }),
        punches: p.punches.filter(function (x) { return x.start >= Date.parse(from + 'T00:00:00') && x.start < Date.parse(ymdPlus(week, 8) + 'T00:00:00'); }),
        pendingUnav: p.unav.filter(function (x) { return x.status === 'en_attente' && x.day >= today; }),
        pendingSwaps: p.shifts.filter(function (x) { return (x.status === 'a_remplacer' || x.status === 'propose') && x.day >= today && visible(x); })
      }));
    },
    saveStaff: function (x) {
      var p = planningData(), row = x.id && planningFind(p.staff, x.id);
      if (!row) { row = { id: 'st_' + Date.now().toString(36) }; p.staff.push(row); }
      Object.assign(row, { name: x.name, poste: x.poste, weeklyHours: x.weeklyHours, active: x.active !== false });
      var pv = p.priv[row.id] = p.priv[row.id] || {};
      pv.hourlyCost = x.hourlyCost;
      if (x.pin !== undefined && x.pin !== null) pv.pin = x.pin || null;
      planningSave(p); return Promise.resolve(clone(row));
    },
    saveShift: function (x) {
      var p = planningData();
      if (x.start === x.end) return Promise.reject(new Error('Le début et la fin sont identiques'));
      var row = x.id && planningFind(p.shifts, x.id);
      if (!row) { row = { id: 'sh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), status: 'prevu', swapReason: '', proposedStaff: null }; p.shifts.push(row); }
      if (row.staffId && row.staffId !== x.staffId) { row.status = 'prevu'; row.proposedStaff = null; }
      Object.assign(row, { staffId: x.staffId, day: x.day, start: x.start, end: x.end, brk: x.brk || 0, poste: x.poste, note: x.note || '' });
      planningSave(p); return Promise.resolve(clone(row));
    },
    deleteShift: function (id) { var p = planningData(); p.shifts = p.shifts.filter(function (x) { return x.id !== id; }); planningSave(p); return Promise.resolve(); },
    copyWeek: function (from, to) {
      var p = planningData(), n = 0;
      p.shifts.filter(function (x) { return x.day >= from && x.day < ymdPlus(from, 7); }).forEach(function (x) {
        var day = ymdPlus(x.day, 7 * Math.round((Date.parse(to) - Date.parse(from)) / (7 * 86400000)));
        if (p.shifts.some(function (y) { return y.staffId === x.staffId && y.day === day; })) return;
        p.shifts.push(Object.assign({}, x, { id: 'sh_' + Date.now().toString(36) + (++n), day: day, status: 'prevu', swapReason: '', proposedStaff: null }));
      });
      planningSave(p); return Promise.resolve(n);
    },
    publish: function (week, on) { var p = planningData(); p.weeks[week] = on ? Date.now() : null; planningSave(p); return Promise.resolve(); },
    addUnav: function (x, pin) {
      var p = planningData();
      try { planningPin(p, x.staffId, pin, !planning.asTeam); } catch (e) { return Promise.reject(e); }
      var row = { id: 'un_' + Date.now().toString(36), staffId: x.staffId, day: x.day, start: x.start == null ? null : x.start, end: x.end == null ? null : x.end,
        reason: x.reason || '', status: planning.asTeam ? 'en_attente' : 'acceptee' };
      p.unav.push(row); planningSave(p); return Promise.resolve(clone(row));
    },
    cancelUnav: function (id, pin) {
      var p = planningData(), u = planningFind(p.unav, id);
      try { planningPin(p, u.staffId, pin, !planning.asTeam); } catch (e) { return Promise.reject(e); }
      p.unav = p.unav.filter(function (x) { return x.id !== id; }); planningSave(p); return Promise.resolve();
    },
    decideUnav: function (id, accept) { var p = planningData(), u = planningFind(p.unav, id); if (u) u.status = accept ? 'acceptee' : 'refusee'; planningSave(p); return Promise.resolve(); },
    release: function (id, reason, pin) {
      var p = planningData(), s = planningFind(p.shifts, id);
      try { planningPin(p, s.staffId, pin, !planning.asTeam); } catch (e) { return Promise.reject(e); }
      s.status = 'a_remplacer'; s.swapReason = reason || ''; s.proposedStaff = null; planningSave(p); return Promise.resolve();
    },
    take: function (id, staffId, pin) {
      var p = planningData(), s = planningFind(p.shifts, id);
      if (s.staffId === staffId) return Promise.reject(new Error('C’est déjà votre créneau'));
      try { planningPin(p, staffId, pin, !planning.asTeam); } catch (e) { return Promise.reject(e); }
      s.status = 'propose'; s.proposedStaff = staffId; planningSave(p); return Promise.resolve();
    },
    decideSwap: function (id, accept) {
      var p = planningData(), s = planningFind(p.shifts, id);
      if (accept && s.proposedStaff) s.staffId = s.proposedStaff;
      s.status = 'prevu'; s.proposedStaff = null; s.swapReason = ''; planningSave(p); return Promise.resolve();
    },
    clock: function (staffId, pin) {
      var p = planningData();
      try { planningPin(p, staffId, pin, !planning.asTeam); } catch (e) { return Promise.reject(e); }
      var open = p.punches.filter(function (x) { return x.staffId === staffId && !x.end && Date.now() - x.start < 20 * 3600000; })[0];
      if (open) { open.end = Date.now(); planningSave(p); return Promise.resolve({ kind: 'out', at: open.end, startedAt: open.start }); }
      var row = { id: 'pu_' + Date.now().toString(36), staffId: staffId, start: Date.now(), end: null, edited: false };
      p.punches.push(row); planningSave(p); return Promise.resolve({ kind: 'in', at: row.start });
    },
    editPunch: function (id, start, end) { var p = planningData(), x = planningFind(p.punches, id); Object.assign(x, { start: start, end: end || null, edited: true }); planningSave(p); return Promise.resolve(); }
  };

  // Fournisseurs de démonstration.
  function suppliersData() {
    var d = read(K.suppliers, null);
    if (d) return d;
    d = {
      suppliers: [
        { id: 'sp1', name: 'DistriFrais 33', email: 'commandes@distrifrais.example', phone: '', coverDays: 2, note: 'Livre du lundi au samedi, commande avant 18 h' },
        { id: 'sp2', name: 'Boissons du Sud-Ouest', email: '', phone: '', coverDays: 7, note: 'Livraison le mardi' }
      ],
      products: {
        burrata: { supplierId: 'sp1', packSize: 6, packLabel: 'carton de 6', ref: 'BUR125' },
        entrecote: { supplierId: 'sp1', packSize: 1, packLabel: 'pièce de 300 g', ref: '' },
        spritz: { supplierId: 'sp2', packSize: 8, packLabel: 'bouteille de prosecco (8 verres)', ref: 'PRO75' },
        citronnade: { supplierId: 'sp2', packSize: 10, packLabel: 'filet de citrons (10 verres)', ref: '' }
      },
      orders: []
    };
    write(K.suppliers, d);
    return d;
  }
  var suppliers = {
    load: function () {
      var d = suppliersData();
      return Promise.resolve(clone({ suppliers: d.suppliers, products: d.products, orders: d.orders }));
    },
    save: function (x) {
      var d = suppliersData();
      if (d.suppliers.some(function (s) { return s.id !== x.id && s.name.toLowerCase() === x.name.trim().toLowerCase(); })) return Promise.reject(new Error('Un fournisseur porte déjà ce nom.'));
      var row = x.id && d.suppliers.filter(function (s) { return s.id === x.id; })[0];
      if (!row) { row = { id: 'sp_' + Date.now().toString(36) }; d.suppliers.push(row); }
      Object.assign(row, { name: x.name.trim(), email: x.email || '', phone: x.phone || '', coverDays: x.coverDays, note: x.note || '' });
      write(K.suppliers, d); return Promise.resolve(clone(row));
    },
    remove: function (id) {
      var d = suppliersData();
      d.suppliers = d.suppliers.filter(function (s) { return s.id !== id; });
      Object.keys(d.products).forEach(function (k) { if (d.products[k].supplierId === id) delete d.products[k]; });
      write(K.suppliers, d); return Promise.resolve();
    },
    setProduct: function (itemId, supplierId, packSize, packLabel, ref) {
      var d = suppliersData();
      if (!supplierId) delete d.products[itemId];
      else d.products[itemId] = { supplierId: supplierId, packSize: packSize || 1, packLabel: packLabel || '', ref: ref || '' };
      write(K.suppliers, d); return Promise.resolve();
    },
    learn: function (name, itemIds) {
      var d = suppliersData(), n = String(name || '').trim();
      if (!n) return Promise.resolve(null);
      var row = d.suppliers.filter(function (s) { return s.name.toLowerCase() === n.toLowerCase(); })[0];
      if (!row) { row = { id: 'sp_' + Date.now().toString(36), name: n, email: '', phone: '', coverDays: 2, note: '' }; d.suppliers.push(row); }
      (itemIds || []).forEach(function (id) { if (!d.products[id]) d.products[id] = { supplierId: row.id, packSize: 1, packLabel: '', ref: '' }; });
      write(K.suppliers, d); return Promise.resolve(row.id);
    },
    recordOrder: function (supplierId, lines, note, via) {
      var d = suppliersData(), sup = d.suppliers.filter(function (s) { return s.id === supplierId; })[0];
      var row = { id: 'so_' + Date.now().toString(36), supplierId: supplierId, supplierName: sup ? sup.name : '', lines: lines, note: note || '', via: via, status: 'envoyee', at: Date.now() };
      d.orders.unshift(row); write(K.suppliers, d); return Promise.resolve(clone(row));
    },
    closeOrder: function (id, status) {
      var d = suppliersData();
      d.orders.forEach(function (o) { if (o.id === id && o.status === 'envoyee') o.status = status; });
      write(K.suppliers, d); return Promise.resolve();
    }
  };

  // Pack HACCP de démonstration : plan type et deux semaines de relevés.
  function haccpData() {
    var h = read(K.haccp, null);
    if (h) return h;
    var n = 0, id = function (p) { return p + (++n); };
    var eq = function (station, name, kind, min, max) { return { id: id('eq'), station: station, name: name, kind: kind, min: min, max: max, active: true }; };
    var task = function (station, label, frequency) { return { id: id('tk'), station: station, label: label, frequency: frequency, active: true }; };
    h = {
      equipment: [eq('cuisine', 'Réfrigérateur cuisine', 'positif', 0, 4), eq('cuisine', 'Congélateur cuisine', 'negatif', null, -18), eq('bar', 'Réfrigérateur bar', 'positif', 0, 4)],
      tasks: [task('cuisine', 'Plans de travail et planches désinfectés', 'jour'), task('cuisine', 'Sols de la cuisine lavés', 'jour'),
        task('cuisine', 'Trancheuse et petit matériel démontés et lavés', 'jour'), task('cuisine', 'Réfrigérateurs vidés et nettoyés à l’intérieur', 'semaine'),
        task('cuisine', 'Filtres de la hotte dégraissés', 'semaine'), task('cuisine', 'Congélateur dégivré et nettoyé', 'mois'),
        task('bar', 'Comptoir, tireuse et becs verseurs', 'jour'), task('bar', 'Machine à café purgée et nettoyée', 'jour'), task('bar', 'Lignes de bière nettoyées', 'semaine')],
      readings: [], cleanings: [], receptions: []
    };
    var who = ['LM', 'SB', 'KD'];
    for (var d = 14; d >= 0; d--) {
      [9, 17].forEach(function (hour, k) {
        var at = new Date(); at.setDate(at.getDate() - d); at.setHours(hour, 10 + k * 5, 0, 0);
        if (at > new Date() || (d === 0 && hour > 12)) return;
        h.equipment.forEach(function (e, i) {
          if (d === 0 && i === 2) return; // relevé du bar oublié ce matin
          var bad = d === 6 && hour === 17 && i === 0;
          var t = e.kind === 'negatif' ? -21 + ((d + i) % 3) : bad ? 6.5 : 2 + ((d + hour + i) % 3) * 0.5;
          h.readings.push({ id: id('rd'), equipmentId: e.id, station: e.station, temp: t, ok: !bad, action: bad ? 'Porte mal fermée : refermée, recontrôle 1 h après à 3,5 °C' : '',
            by: who[(d + i) % 3], at: at.getTime() });
        });
      });
      if (d === 0) continue;
      h.tasks.forEach(function (t, i) {
        var at = new Date(); at.setDate(at.getDate() - d); at.setHours(23, 20 + i, 0, 0);
        var due = t.frequency === 'jour' || (t.frequency === 'semaine' && at.getDay() === 1) || (t.frequency === 'mois' && d === 10);
        if (due) h.cleanings.push({ id: id('cl'), taskId: t.id, station: t.station, note: '', by: who[(d + i) % 3], at: at.getTime() });
      });
    }
    var rec = function (days, station, supplier, product, temp, ok, action) {
      var at = new Date(); at.setDate(at.getDate() - days); at.setHours(8, 40, 0, 0);
      h.receptions.push({ id: id('rc'), station: station, supplier: supplier, product: product, temp: temp, ok: ok, action: action, by: 'LM', at: at.getTime() });
    };
    rec(1, 'cuisine', 'DistriFrais 33', 'Burrata, viandes, crème', 3, true, '');
    rec(4, 'cuisine', 'Marée Atlantique', 'Saumon, dorades', 7, false, 'Saumon refusé (8 °C à cœur), avoir demandé au livreur');
    rec(5, 'bar', 'Boissons du Sud-Ouest', 'Prosecco, sodas, citrons', null, true, '');
    h.readings.sort(function (a, b) { return b.at - a.at; });
    h.cleanings.sort(function (a, b) { return b.at - a.at; });
    h.receptions.sort(function (a, b) { return b.at - a.at; });
    write(K.haccp, h);
    return h;
  }
  function haccpSave(h) { write(K.haccp, h); }
  var haccp = {
    load: function (since, until) {
      var h = haccpData(), inRange = function (x) { return x.at >= since && (!until || x.at < until); };
      return Promise.resolve(clone({ equipment: h.equipment, tasks: h.tasks, readings: h.readings.filter(inRange),
        cleanings: h.cleanings.filter(inRange), receptions: h.receptions.filter(inRange) }));
    },
    seed: function () { return Promise.resolve(); },
    saveEquipment: function (e) {
      var h = haccpData(), x = e.id && h.equipment.filter(function (q) { return q.id === e.id; })[0];
      if (!x) { x = { id: 'eq_' + Date.now().toString(36), active: true }; h.equipment.push(x); }
      Object.assign(x, { station: e.station, name: e.name, kind: e.kind, min: e.min, max: e.max });
      haccpSave(h); return Promise.resolve(clone(x));
    },
    saveTask: function (t) {
      var h = haccpData(), x = t.id && h.tasks.filter(function (q) { return q.id === t.id; })[0];
      if (!x) { x = { id: 'tk_' + Date.now().toString(36), active: true }; h.tasks.push(x); }
      Object.assign(x, { station: t.station, label: t.label, frequency: t.frequency });
      haccpSave(h); return Promise.resolve(clone(x));
    },
    archive: function (kind, id) {
      var h = haccpData();
      (kind === 'equipment' ? h.equipment : h.tasks).forEach(function (x) { if (x.id === id) x.active = false; });
      haccpSave(h); return Promise.resolve();
    },
    recordTemp: function (equipmentId, temp, action, by) {
      var h = haccpData(), e = h.equipment.filter(function (q) { return q.id === equipmentId; })[0];
      var ok = (e.min == null || temp >= e.min) && (e.max == null || temp <= e.max);
      if (!ok && !String(action || '').trim()) return Promise.reject(new Error('Température hors limites : indiquez l’action corrective'));
      var row = { id: 'rd_' + Date.now().toString(36), equipmentId: e.id, station: e.station, temp: Math.round(temp * 10) / 10, ok: ok, action: action || '', by: by, at: Date.now() };
      h.readings.unshift(row); haccpSave(h); return Promise.resolve(clone(row));
    },
    markClean: function (taskId, note, by) {
      var h = haccpData(), t = h.tasks.filter(function (q) { return q.id === taskId; })[0];
      var row = { id: 'cl_' + Date.now().toString(36), taskId: t.id, station: t.station, note: note || '', by: by, at: Date.now() };
      h.cleanings.unshift(row); haccpSave(h); return Promise.resolve(clone(row));
    },
    recordReception: function (r) {
      if (!r.ok && !String(r.action || '').trim()) return Promise.reject(new Error('Livraison non conforme : indiquez l’action (refus, avoir…)'));
      var h = haccpData(), row = Object.assign({ id: 'rc_' + Date.now().toString(36), at: Date.now() }, r);
      h.receptions.unshift(row); haccpSave(h); return Promise.resolve(clone(row));
    }
  };

  var margins = {
    load: function () { return Promise.resolve(clone(marginsData())); },
    saveIngredient: function (id, name, unit, cost) {
      var m = marginsData(), x = id && m.ingredients.filter(function (i) { return i.id === id; })[0];
      if (m.ingredients.some(function (i) { return i.id !== id && i.name.toLowerCase() === String(name).trim().toLowerCase(); })) {
        return Promise.reject(new Error('Un ingrédient porte déjà ce nom.'));
      }
      if (x) { if (x.cost !== cost) { x.prevCost = x.cost; x.costUpdatedAt = Date.now(); x.source = 'manuel'; } x.name = name; x.unit = unit; x.cost = cost; }
      else { x = { id: 'i_' + Date.now().toString(36), name: name, unit: unit, cost: cost, prevCost: null, costUpdatedAt: Date.now(), source: 'manuel' }; m.ingredients.push(x); }
      write(K.margins, m);
      return Promise.resolve(clone(x));
    },
    deleteIngredient: function (id) {
      var m = marginsData();
      var has = function (lines) { return (lines || []).some(function (l) { return l.ingredientId === id; }); };
      var used = Object.keys(m.recipes).some(function (k) { return has(m.recipes[k].lines) || (m.recipes[k].options || []).some(function (o) { return has(o.lines); }); });
      if (used) return Promise.reject(new Error('Cet ingrédient est utilisé dans une fiche technique : retirez-le d’abord de la fiche.'));
      m.ingredients = m.ingredients.filter(function (i) { return i.id !== id; });
      write(K.margins, m);
      return Promise.resolve();
    },
    saveRecipe: function (itemId, mode, vat, lines, purchaseCost, options) {
      var m = marginsData();
      m.recipes[itemId] = { mode: mode, vat: vat, lines: lines, purchaseCost: purchaseCost, options: options || [] };
      write(K.margins, m);
      return Promise.resolve();
    },
    recordPrices: function () { return Promise.resolve(0); }
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
    // En démo, la carte de démonstration est déjà traduite en anglais ; la traduction par l'IA fonctionne en ligne.
    translateMenu: function () { return Promise.reject(new Error('La traduction par l’IA fonctionne sur votre vrai restaurant (en ligne). La carte de démonstration est déjà traduite en anglais.')); },
    getMenu: getMenu,
    getItem: getItem,
    saveItem: saveItem,
    deleteItem: deleteItem,
    replaceMenu: replaceMenu,
    setAvailable: setAvailable,
    buildLine: buildLine,
    promoOf: promoOf,
    itemPrice: itemPrice,
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
    margins: margins,
    haccp: haccp,
    suppliers: suppliers,
    planning: planning,
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
