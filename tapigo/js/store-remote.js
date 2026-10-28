/* ==========================================================================
   Tapigo — Store en ligne (Supabase, multi-restaurants)

   Actif uniquement si js/config.js contient l'URL et la clé du projet.
   Remplace les fonctions du store de démo par des appels à Supabase, en
   gardant la même API synchrone grâce à un cache local :
     - lectures (getMenu, getOrders…) : servies depuis le cache ;
     - écritures : appliquées au cache immédiatement, puis envoyées au serveur ;
     - temps réel : la cuisine reçoit les commandes via Supabase Realtime,
       le client suit sa commande via get_order() (toutes les 4 s).

   Chaque page ouvre un restaurant :
     - client     : T.openRestaurant(slug)          (slug lu dans ?r=…)
     - dashboard  : T.startStaff({ id, slug, role }) (après connexion)
   Le schéma de la base est dans supabase/schema.sql.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.TAPIGO_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var EMPTY_MENU = { categories: [], tags: {}, items: [] };
  var DEFAULT_INFO = { name: 'Mon restaurant', tagline: '', tables: 12 };

  var T = window.Tapigo;
  var emit = T._emit;
  var sb = null;
  var current = null; // { id, slug, role }
  var cache = { info: clone(DEFAULT_INFO), menu: null, orders: [], requests: [], stock: {}, servers: {}, awaiting: [], onlinePayment: false };
  var pendingMenuWrites = 0;

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  // Fiche restaurant. Tolère une base pas encore mise à jour (schema.sql non
  // relancé) : sans la colonne online_payment, on relit sans elle.
  var payColumn = true;
  function selectRestaurant(cols, build) {
    var run = function () { return build(sb.from('restaurants').select(cols + (payColumn ? ', online_payment' : ''))); };
    return run().then(function (r) {
      if (r.error && payColumn && /online_payment/.test(r.error.message || '')) { payColumn = false; return run(); }
      return r;
    });
  }

  function fail(err) {
    var msg = (err && err.message) || String(err || 'Erreur inconnue');
    console.error('[Tapigo]', err);
    emit('error', { message: msg });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Connexion impossible. Vérifiez votre accès à Internet.')); };
      document.head.appendChild(s);
    });
  }

  // reason : 'old-link' (plaque sans ?r= alors qu'il y a plusieurs restaurants),
  //          'unknown' (identifiant inexistant) ou 'closed' (restaurant désactivé).
  function notFound(reason, slug) {
    var msg = reason === 'old-link'
      ? 'Ce lien ne précise pas le restaurant (ancien format, sans « ?r= »). Reprogrammez la plaque NFC avec le lien copié depuis l’espace admin.'
      : reason === 'closed'
        ? 'La commande en ligne est momentanément indisponible dans ce restaurant. Adressez-vous au serveur, il prend votre commande.'
        : 'Aucun restaurant ne correspond à l’identifiant « ' + slug + ' ». Vérifiez le lien de la plaque NFC.';
    var e = new Error(msg);
    e.code = 'NOT_FOUND';
    e.reason = reason;
    return e;
  }

  /* ---------------- Conversions base <-> app ---------------- */
  function ts(v) { return typeof v === 'number' ? v : (Date.parse(v) || Date.now()); }

  function fromRow(r) {
    return {
      id: r.id,
      number: Number(r.number),
      table: String(r.table_label),
      lines: r.lines || [],
      note: r.note || '',
      payment: r.payment || { method: 'onsite', status: 'pending' },
      total: Number(r.total) || 0,
      tip: Number(r.tip) || 0,
      status: r.status,
      createdAt: ts(r.created_at),
      history: (r.history || []).map(function (h) { return { status: h.status, at: ts(h.at) }; }),
      seen: !!r.seen,
      source: r.source || 'client'
    };
  }

  function awaiting(o) { return o.payment && o.payment.status === 'awaiting'; }

  function findOrder(id) {
    return cache.orders.filter(function (o) { return o.id === id; })[0] || null;
  }

  function upsert(o) {
    var i = cache.orders.findIndex(function (x) { return x.id === o.id; });
    if (i >= 0) cache.orders[i] = o; else cache.orders.push(o);
    return o;
  }

  function applyRestaurant(row, skipMenu) {
    cache.info = Object.assign(clone(DEFAULT_INFO), row.info || {});
    if ('online_payment' in row) cache.onlinePayment = !!row.online_payment;
    if (!skipMenu) cache.menu = row.menu || null;
  }

  // La carte se met à jour en direct quand le restaurateur la modifie.
  // On ne se fie PAS au contenu de l'événement : Supabase peut omettre les
  // colonnes volumineuses inchangées (la carte), ce qui la ferait paraître
  // vide. On relit donc la fiche complète, sans écraser une écriture en cours.
  var refreshTimer = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      if (pendingMenuWrites > 0) return scheduleRefresh();
      refreshRestaurant().catch(function () {});
    }, 400);
  }

  function subscribeRestaurant() {
    sb.channel('tapigo-restaurant-' + current.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurants', filter: 'id=eq.' + current.id }, scheduleRefresh)
      .subscribe();
  }

  /* ---------------- Écritures carte / établissement ---------------- */
  function persist(fields) {
    fields.updated_at = new Date().toISOString();
    var isMenu = 'menu' in fields;
    if (isMenu) pendingMenuWrites++;
    var done = function () { if (isMenu) pendingMenuWrites = Math.max(0, pendingMenuWrites - 1); };
    return sb.from('restaurants').update(fields).eq('id', current.id).select('id').then(function (r) {
      done();
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error('Modification refusée : seul le gérant peut modifier la carte.');
    }, function (e) { done(); throw e; }).catch(function (e) {
      fail(e);
      return refreshRestaurant().catch(function () {});
    });
  }

  function refreshRestaurant() {
    return selectRestaurant('info, menu', function (q) { return q.eq('id', current.id).maybeSingle(); }).then(function (r) {
      if (r.error) throw r.error;
      if (!r.data) return;
      var before = JSON.stringify([cache.info, cache.menu, cache.onlinePayment]);
      applyRestaurant(r.data);
      // Rien n'a changé (ex. simple compteur) : on ne touche pas à l'écran.
      if (JSON.stringify([cache.info, cache.menu, cache.onlinePayment]) === before) return;
      emit('menu:updated', null);
      emit('restaurant:updated', clone(cache.info));
    });
  }

  // Une carte neuve reçoit les catégories et étiquettes standard.
  function menuForWrite() {
    var m = cache.menu || clone(EMPTY_MENU);
    var d = window.TAPIGO_DEMO;
    if (d && (!m.categories || !m.categories.length)) m.categories = clone(d.categories);
    if (d && (!m.tags || !Object.keys(m.tags).length)) m.tags = clone(d.tags);
    return m;
  }

  T.mode = 'live';
  T.currentRestaurant = function () { return clone(current); };
  T.hasMenu = function () { return !!(cache.menu && cache.menu.items && cache.menu.items.length); };
  T.getRestaurant = function () { return clone(cache.info); };
  T.getMenu = function () { return clone(cache.menu || EMPTY_MENU); };
  // Le restaurant propose « Payer maintenant » (compte Stripe validé + option activée).
  T.canPayOnline = function () { return !!cache.onlinePayment; };

  T.saveRestaurant = function (info) {
    cache.info = Object.assign(clone(DEFAULT_INFO), info);
    emit('restaurant:updated', clone(cache.info));
    persist({ info: cache.info });
  };

  T.replaceMenu = function (menu) {
    cache.menu = clone(menu);
    emit('menu:updated', null);
    return persist({ menu: cache.menu });
  };

  T.saveItem = function (item) {
    var menu = menuForWrite();
    item = clone(item);
    if (!item.id) {
      var base = T._slug(item.name), id = base, n = 2;
      while (menu.items.some(function (i) { return i.id === id; })) id = base + '-' + n++;
      item.id = id;
    }
    var idx = menu.items.findIndex(function (i) { return i.id === item.id; });
    if (idx >= 0) menu.items[idx] = item; else menu.items.push(item);
    cache.menu = menu;
    emit('menu:updated', { id: item.id });
    persist({ menu: cache.menu });
    return clone(item);
  };

  T.deleteItem = function (id) {
    var menu = menuForWrite();
    menu.items = menu.items.filter(function (i) { return i.id !== id; });
    cache.menu = menu;
    emit('menu:updated', { id: id });
    persist({ menu: cache.menu });
  };

  // Rupture / remise en vente : autorisée à toute l'équipe (pas seulement au gérant).
  T.setAvailable = function (id, available) {
    var item = (cache.menu && cache.menu.items || []).filter(function (i) { return i.id === id; })[0];
    if (!item) return;
    item.available = !!available;
    emit('menu:updated', { id: id });
    sb.rpc('set_item_available', { p_restaurant: current.id, p_item: id, p_available: !!available })
      .then(function (r) { if (r.error) { fail(r.error); refreshRestaurant().catch(function () {}); } });
  };

  /* ---------------- Stocks ---------------- */
  // null = illimité ; 0 = épuisé (plus commandable).
  T.getStock = function (id) { return id in cache.stock ? cache.stock[id] : null; };
  T.getStocks = function () { return clone(cache.stock); };

  T.setStock = function (id, quantity) {
    if (quantity == null) delete cache.stock[id]; else cache.stock[id] = quantity;
    emit('stock:updated', { id: id, quantity: quantity, local: true });
    return sb.rpc('set_stock', { p_restaurant: current.id, p_item: id, p_quantity: quantity })
      .then(function (r) { if (r.error) { fail(r.error); loadStock(); } });
  };

  function loadStock() {
    return sb.from('item_stock').select('item_id, quantity').eq('restaurant_id', current.id).then(function (r) {
      if (r.error) throw r.error;
      cache.stock = {};
      (r.data || []).forEach(function (x) { cache.stock[x.item_id] = x.quantity; });
      emit('stock:updated', null);
    });
  }

  function subscribeStock() {
    sb.channel('tapigo-stock-' + current.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_stock', filter: 'restaurant_id=eq.' + current.id }, function (p) {
        if (p.eventType === 'DELETE') {
          if (p.old && p.old.item_id) delete cache.stock[p.old.item_id];
          else return loadStock().catch(function () {});
          emit('stock:updated', { id: p.old.item_id, quantity: null });
          return;
        }
        var before = cache.stock[p.new.item_id];
        cache.stock[p.new.item_id] = p.new.quantity;
        if (before !== p.new.quantity) emit('stock:updated', { id: p.new.item_id, quantity: p.new.quantity });
      })
      .subscribe(function (status) { if (status === 'SUBSCRIBED') loadStock().catch(function () {}); });
  }

  /* ---------------- Serveur attitré des tables ---------------- */
  T.getTableServers = function () { return clone(cache.servers); };
  T.getTableServer = function (table) { return cache.servers[String(table)] || ''; };

  T.setTableServers = function (tables, name) {
    name = String(name || '').trim().slice(0, 40);
    tables = tables.map(String);
    tables.forEach(function (t) { if (name) cache.servers[t] = name; else delete cache.servers[t]; });
    emit('servers:updated', null);
    return sb.rpc('set_table_servers', { p_restaurant: current.id, p_tables: tables, p_name: name })
      .then(function (r) { if (r.error) { fail(r.error); loadServers(); } });
  };

  function loadServers() {
    return sb.from('table_servers').select('table_label, server_name').eq('restaurant_id', current.id).then(function (r) {
      if (r.error) return; // schéma pas encore à jour : pas de serveur affiché
      cache.servers = {};
      (r.data || []).forEach(function (x) { if (x.server_name) cache.servers[x.table_label] = x.server_name; });
      emit('servers:updated', null);
    });
  }

  function subscribeServers() {
    sb.channel('tapigo-servers-' + current.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_servers', filter: 'restaurant_id=eq.' + current.id }, function () {
        loadServers();
      })
      .subscribe(function (status) { if (status === 'SUBSCRIBED') loadServers(); });
  }

  /* ---------------- Dates limites (DLC / DDM) ---------------- */
  // Un compte équipe ne reçoit que les produits de son poste (règle de la base).
  var expiryCache = [];
  function fromExpiry(r) {
    return { id: r.id, station: r.station, label: r.label, itemId: r.item_id, kind: r.kind, expiresOn: r.expires_on,
      quantity: r.quantity || '', note: r.note || '', status: r.status, closedAt: r.closed_at ? Date.parse(r.closed_at) : null };
  }
  function loadExpiry() {
    var since = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    return sb.from('expiry_items').select('*').eq('restaurant_id', current.id)
      .or('status.eq.actif,closed_at.gte."' + since + '"').order('expires_on', { ascending: true }).limit(1000)
      .then(function (r) {
        if (r.error) {
          if (/expiry_items/.test(r.error.message)) { expiryCache = null; emit('expiry:updated', null); return; } // schéma pas à jour
          throw r.error;
        }
        expiryCache = r.data.map(fromExpiry);
        emit('expiry:updated', null);
      });
  }
  function subscribeExpiry() {
    sb.channel('tapigo-expiry-' + current.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expiry_items', filter: 'restaurant_id=eq.' + current.id }, function () {
        loadExpiry().catch(function () {});
      })
      .subscribe(function (status) { if (status === 'SUBSCRIBED') loadExpiry().catch(function () {}); });
  }
  T.expiry = {
    station: function () { return (current && current.station) || 'all'; },
    // Gérant : comptes du restaurant et poste de chaque compte équipe.
    team: function () { return rpc('team_members', { p_restaurant: current.id }); },
    setStation: function (user, station) { return rpc('set_member_station', { p_restaurant: current.id, p_user: user, p_station: station }); },
    // Photo d'une étiquette -> { label, kind, expires_on, quantity, lot, warning } (rien n'est enregistré).
    readLabel: function (image) { return callFunction('label-scan', { restaurant_id: current.id, image: image }); },
    // null : la base n'a pas encore la table (relancer supabase/schema.sql).
    list: function () { return expiryCache ? clone(expiryCache) : null; },
    add: function (e) {
      return rpc('add_expiry', { p_restaurant: current.id, p_station: e.station, p_label: e.label, p_item: e.itemId || null,
        p_kind: e.kind, p_date: e.expiresOn, p_quantity: e.quantity || '', p_note: e.note || '' })
        .then(function (row) { return loadExpiry().then(function () { return fromExpiry(row); }); });
    },
    close: function (id, status) {
      return rpc('close_expiry', { p_id: id, p_status: status }).then(function () { return loadExpiry(); });
    }
  };

  T.resetDemo = function () { /* sans objet en ligne */ };

  /* ---------------- Commandes ---------------- */
  T.getOrders = function () { return clone(cache.orders); };
  T.getOrder = function (id) { return clone(findOrder(id)); };

  // Client : envoie le panier, le serveur recalcule les prix et crée la commande.
  T.createOrder = function (payload) {
    var items = (payload.lines || []).filter(Boolean).map(function (l) {
      return { itemId: l.itemId, qty: l.qty, selections: l.selections || {}, note: l.note || '', suggested: l.suggested || 0 };
    });
    var args = {
      p_restaurant: current.slug,
      p_table: String(payload.table || ''),
      p_items: items,
      p_note: payload.note || ''
    };
    if (payload.pay === 'online' || /^(cash|card|mixed)$/.test(payload.pay || '')) args.p_pay = payload.pay;
    if (payload.pay === 'online' && Number(payload.tip) > 0) args.p_tip = Math.round(Number(payload.tip) * 100) / 100;
    return sb.rpc('place_order', args).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      var o = upsert(fromRow(r.data));
      // Le suivi par interrogation ne concerne que le client (l'équipe a le temps réel).
      if (!current.role) { tracked[o.id] = trackKey(o); ensurePolling(); }
      emit('orders:sync', null);
      return clone(o);
    });
  };

  // Équipe : changement de statut (optimiste, puis confirmé par le serveur).
  T.updateOrderStatus = function (id, status) {
    var o = findOrder(id);
    if (!o || o.status === status) return clone(o);
    o.status = status;
    o.seen = true;
    o.history.push({ status: status, at: Date.now() });
    if (status === 'terminee' && o.payment.status === 'pending') o.payment.status = 'paid';
    emit('order:updated', clone(o));
    sb.rpc('set_order_status', { p_id: id, p_status: status }).then(function (r) {
      if (r.error) throw r.error;
      if (r.data) upsert(fromRow(r.data));
    }).catch(function (e) { fail(e); loadOrders(); });
    return clone(o);
  };

  T.markSeen = function (id) {
    var o = findOrder(id);
    if (!o || o.seen) return;
    o.seen = true;
    emit('order:updated', clone(o));
    sb.from('orders').update({ seen: true }).eq('id', id).then(function (r) { if (r.error) fail(r.error); });
  };

  /* ---------------- Côté client ---------------- */
  // slug absent (ancienne plaque sans ?r=) : accepté s'il n'existe qu'un restaurant.
  T.openRestaurant = function (slug) {
    return selectRestaurant('id, slug, info, menu, active', function (q) {
      return slug ? q.eq('slug', slug).limit(1) : q.eq('active', true).limit(2);
    }).then(function (r) {
      if (r.error) throw new Error('Base de données inaccessible : ' + r.error.message);
      var rows = r.data || [];
      if (!slug && rows.length !== 1) throw notFound(rows.length ? 'old-link' : 'closed', '');
      if (!rows.length) throw notFound('unknown', slug);
      if (!rows[0].active) throw notFound('closed', slug);
      current = { id: rows[0].id, slug: rows[0].slug, role: null };
      applyRestaurant(rows[0]);
      subscribeRestaurant();
      subscribeStock();
      subscribeServers();
      return Promise.all([loadStock().catch(function () {}), loadServers()]).then(function () { return clone(current); });
    });
  };

  var tracked = {};
  var pollTimer = null;

  // Statut + état du paiement : le client voit aussi passer « Payé ».
  function trackKey(o) { return o.status + '|' + (o.payment && o.payment.status); }

  function pollOnce(announce) {
    var ids = Object.keys(tracked).filter(function (id) { return !/^terminee\|/.test(tracked[id] || ''); });
    if (!ids.length) return Promise.resolve();
    return Promise.all(ids.map(function (id) {
      return sb.rpc('get_order', { p_id: id }).then(function (r) {
        if (r.error) return;
        if (!r.data) {
          // Paiement en ligne abandonné : la commande n'existe plus.
          delete tracked[id];
          cache.orders = cache.orders.filter(function (o) { return o.id !== id; });
          return;
        }
        var o = upsert(fromRow(r.data));
        var prev = tracked[id];
        tracked[id] = trackKey(o);
        if (prev && prev !== tracked[id]) emit('order:updated', clone(o));
      });
    })).then(function () { if (announce) emit('orders:sync', null); });
  }

  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () { if (!document.hidden) pollOnce(false); }, 4000);
  }

  T.track = function (ids) {
    [].concat(ids || []).filter(function (id) { return UUID.test(id); }).forEach(function (id) {
      if (!(id in tracked)) tracked[id] = null;
    });
    ensurePolling();
    return pollOnce(true);
  };

  /* ---------------- Comptes ---------------- */
  T.auth = {
    session: function () {
      return sb.auth.getSession().then(function (r) { return r.data.session; });
    },
    signIn: function (email, password) {
      return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) {
          throw new Error(/invalid login/i.test(r.error.message) ? 'E-mail ou mot de passe incorrect.' : r.error.message);
        }
        return r.data.session;
      });
    },
    signOut: function () { return sb.auth.signOut(); },
    changePassword: function (password) {
      return sb.auth.updateUser({ password: password }).then(function (r) {
        if (r.error) {
          throw new Error(/different from the old/i.test(r.error.message)
            ? 'Le nouveau mot de passe doit être différent de l’ancien.'
            : /at least/i.test(r.error.message) ? 'Mot de passe trop court (6 caractères minimum).' : r.error.message);
        }
      });
    },
    // [{ id, slug, name, active, role: 'admin' | 'owner' | 'equipe' }]
    myRestaurants: function () {
      return sb.rpc('my_restaurants').then(function (r) {
        if (r.error) throw r.error;
        return r.data || [];
      });
    },
    isAdmin: function () {
      return sb.rpc('is_admin').then(function (r) { return !r.error && r.data === true; });
    }
  };

  /* ---------------- Appels du personnel ---------------- */
  // Client : « Appeler le serveur » / « Demander l'addition ».
  T.requestService = function (kind, table) {
    return sb.rpc('request_service', { p_restaurant: current.slug, p_table: String(table || ''), p_kind: kind })
      .then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; });
  };

  T.getServiceRequests = function () {
    return clone(cache.requests.filter(function (q) { return !q.done_at; }));
  };

  T.completeServiceRequest = function (id) {
    cache.requests = cache.requests.filter(function (q) { return q.id !== id; });
    emit('service:updated', null);
    sb.from('service_requests').update({ done_at: new Date().toISOString() }).eq('id', id)
      .then(function (r) { if (r.error) fail(r.error); });
  };

  function loadRequests() {
    var since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    return sb.from('service_requests').select('*').eq('restaurant_id', current.id)
      .is('done_at', null).gte('created_at', since).order('created_at', { ascending: true })
      .then(function (r) {
        if (r.error) throw r.error;
        cache.requests = r.data || [];
        emit('service:updated', null);
      });
  }

  // Équipe : tout est encaissé pour la table.
  T.closeTable = function (table) {
    cache.orders.forEach(function (o) {
      if (o.table === String(table) && o.status !== 'terminee') {
        o.status = 'terminee'; o.seen = true; o.payment.status = 'paid';
        o.history.push({ status: 'terminee', at: Date.now() });
      }
    });
    cache.requests = cache.requests.filter(function (q) { return q.table_label !== String(table); });
    emit('orders:sync', null);
    emit('service:updated', null);
    return sb.rpc('close_table', { p_restaurant: current.id, p_table: String(table) }).then(function (r) {
      if (r.error) { fail(r.error); loadOrders(); }
      return r.data;
    });
  };

  T.setOrdersPaused = function (paused) {
    var info = clone(cache.info);
    if (paused) info.ordersPaused = true; else delete info.ordersPaused;
    T.saveRestaurant(info);
  };

  /* ---------------- Statistiques ---------------- */
  // Toutes les commandes des `days` derniers jours (par pages de 1000).
  T.loadStats = function (days) {
    var since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    var out = [];
    function page(from) {
      return sb.from('orders').select('id, number, table_label, lines, total, status, history, payment, created_at, source')
        .eq('restaurant_id', current.id).gte('created_at', since)
        .order('created_at', { ascending: true }).range(from, from + 999)
        .then(function (r) {
          if (r.error) throw r.error;
          out = out.concat(r.data.map(fromRow).filter(function (o) { return !awaiting(o); }));
          return r.data.length === 1000 && out.length < 20000 ? page(from + 1000) : out;
        });
    }
    return page(0);
  };

  /* ---------------- Photos ---------------- */
  T.uploadPhoto = function (file) {
    return window.TapigoUI.compressImage(file, 1200, 0.82).then(function (blob) {
      var path = current.id + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.jpg';
      return sb.storage.from('menu-photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
        .then(function (r) {
          if (r.error) {
            throw new Error(/row-level security|unauthorized|403/i.test(r.error.message)
              ? 'Envoi refusé : seul le gérant peut ajouter des photos.'
              : /bucket not found/i.test(r.error.message)
                ? 'Le stockage des photos n’est pas encore activé (relancez supabase/schema.sql).'
                : r.error.message);
          }
          return sb.storage.from('menu-photos').getPublicUrl(path).data.publicUrl;
        });
    });
  };

  /* ---------------- Espace équipe ---------------- */
  var staffStarted = false;

  function loadOrders() {
    var since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    return sb.from('orders').select('*')
      .eq('restaurant_id', current.id)
      .or('status.neq.terminee,created_at.gte."' + since + '"')
      .order('created_at', { ascending: true })
      .limit(500)
      .then(function (r) {
        if (r.error) throw r.error;
        var rows = r.data.map(fromRow);
        cache.orders = rows.filter(function (o) { return !awaiting(o); });
        cache.awaiting = rows.filter(awaiting);
        emit('orders:sync', null);
      });
  }

  T.startStaff = function (restaurant) {
    if (staffStarted) return Promise.resolve();
    staffStarted = true;
    current = { id: restaurant.id, slug: restaurant.slug, role: restaurant.role, station: restaurant.station || 'all' };

    return selectRestaurant('info, menu', function (q) { return q.eq('id', current.id).maybeSingle(); }).then(function (r) {
      if (r.error) throw r.error;
      if (!r.data) throw new Error('Restaurant introuvable.');
      applyRestaurant(r.data);
      subscribeRestaurant();
      subscribeStock();
      subscribeServers();
      subscribeExpiry();
      return Promise.all([loadOrders(), loadStock(), loadServers()]);
    }).then(function () {
      sb.channel('tapigo-orders-' + current.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'restaurant_id=eq.' + current.id }, function (p) {
          if (p.eventType === 'DELETE') {
            cache.orders = cache.orders.filter(function (o) { return !p.old || o.id !== p.old.id; });
            cache.awaiting = cache.awaiting.filter(function (o) { return !p.old || o.id !== p.old.id; });
            emit('orders:sync', null);
            return;
          }
          var row = fromRow(p.new);
          // Paiement en ligne pas encore confirmé : pas de ticket en cuisine,
          // seulement la mention « paiement en cours ». La commande arrivera
          // comme « nouvelle » une fois payée.
          cache.awaiting = cache.awaiting.filter(function (o) { return o.id !== row.id; });
          if (awaiting(row)) {
            cache.awaiting.push(row);
            emit('orders:sync', null);
            return;
          }
          var prev = findOrder(p.new.id);
          // Supabase peut omettre les colonnes volumineuses inchangées (lignes).
          if (p.eventType === 'UPDATE' && p.new.lines == null) {
            if (!prev) {
              return sb.from('orders').select('*').eq('id', p.new.id).maybeSingle().then(function (r) {
                if (r.error || !r.data || findOrder(r.data.id)) return;
                emit('order:created', clone(upsert(fromRow(r.data))));
              });
            }
            row.lines = prev.lines;
          }
          var o = upsert(row);
          emit(prev ? 'order:updated' : 'order:created', clone(o));
        })
        .subscribe(function (status) {
          // Après une coupure réseau : on recharge pour ne rien manquer.
          if (status === 'SUBSCRIBED') loadOrders().catch(fail);
        });

      sb.channel('tapigo-requests-' + current.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: 'restaurant_id=eq.' + current.id }, function (p) {
          if (p.eventType === 'INSERT') {
            if (!cache.requests.some(function (q) { return q.id === p.new.id; })) cache.requests.push(p.new);
            emit('service:created', clone(p.new));
          } else if (p.eventType === 'UPDATE' && p.new.done_at) {
            cache.requests = cache.requests.filter(function (q) { return q.id !== p.new.id; });
            emit('service:updated', null);
          }
        })
        .subscribe(function (status) { if (status === 'SUBSCRIBED') loadRequests().catch(fail); });

      // Filet de sécurité si l'écran s'est mis en veille.
      var resync = function () { loadOrders().catch(fail); loadRequests().catch(fail); };
      document.addEventListener('visibilitychange', function () { if (!document.hidden) resync(); });
      window.addEventListener('online', resync);
      setInterval(resync, 60000);
    });
  };

  /* ---------------- Fonctions serveur (supabase/functions) ---------------- */
  function callFunction(name, body) {
    return Promise.resolve().then(function () {
      return sb.functions.invoke(name, { body: body });
    }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      var notDeployed = new Error('Service pas encore activé sur le serveur (fonction « ' + name + ' » à déployer, voir README).');
      if (!ctx || typeof ctx.json !== 'function') throw notDeployed;
      if (ctx.status === 404) throw notDeployed;
      return ctx.json().then(function (j) { throw new Error((j && (j.error || j.message)) || 'Erreur serveur'); },
        function () { throw new Error('Erreur serveur (' + ctx.status + ')'); });
    });
  }

  /* ---------------- Paiement en ligne (Stripe) ---------------- */
  // Après une action sur un paiement en attente : le bandeau « paie en ligne » disparaît tout de suite
  // (le temps réel ne diffuse pas les suppressions filtrées), puis l'équipe recharge ses commandes.
  function settled(orderId, r) {
    if (r && (r.cancelled || r.paid || r.onsite)) {
      cache.awaiting = cache.awaiting.filter(function (o) { return o.id !== orderId; });
      emit('orders:sync', null);
    }
    if (!current || !current.role) return r;
    return loadOrders().then(function () { return r; }, function () { return r; });
  }

  T.payments = {
    // Client : page de paiement Stripe de la commande -> { url } ou { paid: true }.
    checkout: function (orderId) { return callFunction('stripe-checkout', { order_id: orderId }); },
    // Relit l'état du paiement chez Stripe (si la notification de Stripe s'est
    // perdue) : { paid } | { cancelled } | { pending }.
    sync: function (orderId) { return callFunction('stripe-checkout', { order_id: orderId, action: 'sync' }).then(function (r) { return settled(orderId, r); }); },
    // Équipe : le client a finalement réglé à table (espèces, carte ou les deux).
    onsite: function (orderId, w) { return callFunction('stripe-checkout', { order_id: orderId, action: 'onsite', with: w || null }).then(function (r) { return settled(orderId, r); }); },
    // Équipe : commandes payées en ligne dont le paiement n'est pas encore confirmé.
    awaiting: function () { return clone(cache.awaiting); },
    // Client revenu sans payer : la commande est supprimée et le stock rendu.
    cancel: function (orderId) {
      delete tracked[orderId];
      cache.orders = cache.orders.filter(function (o) { return o.id !== orderId; });
      return callFunction('stripe-checkout', { order_id: orderId, action: 'cancel' }).then(function (r) { return settled(orderId, r); });
    },
    // Gérant : { connected, charges_enabled, details_submitted, online_payment }.
    status: function () { return callFunction('stripe-connect', { restaurant_id: current.id, action: 'status' }); },
    onboard: function () { return callFunction('stripe-connect', { restaurant_id: current.id, action: 'onboard' }); },
    setEnabled: function (on) {
      return rpc('set_online_payment', { p_restaurant: current.id, p_enabled: !!on }).then(function () {
        cache.onlinePayment = !!on;
      });
    }
  };

  /* ---------------- Prévision de stock du jour (IA) ---------------- */
  function parisDay() {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  }

  T.forecast = {
    get: function () {
      return sb.from('stock_forecasts').select('*').eq('restaurant_id', current.id).eq('for_date', parisDay())
        .maybeSingle().then(function (r) {
          if (r.error) {
            if (/stock_forecasts/.test(r.error.message)) return null; // schéma pas encore à jour
            throw r.error;
          }
          return r.data;
        });
    },
    run: function (context) {
      return callFunction('stock-forecast', { restaurant_id: current.id, context: context || '' });
    }
  };

  /* ---------------- Bons de livraison lus par l'IA ---------------- */
  T.scan = {
    // pages : [{ media_type, data (base64) }] -> proposition de l'IA, rien n'est encore en stock.
    read: function (pages) {
      return callFunction('stock-scan', { restaurant_id: current.id, pages: pages });
    },
    // lines : [{ itemId, quantity }] validées par l'équipe -> nombre de produits mis à jour.
    apply: function (scanId, lines) {
      return rpc('add_delivery_stock', { p_restaurant: current.id, p_scan: scanId, p_lines: lines }).then(function (n) {
        return loadStock().then(function () { return n; });
      });
    }
  };

  /* ---------------- Administration Tapigo ---------------- */
  function rpc(name, args) {
    return sb.rpc(name, args || {}).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    });
  }

  T.admin = {
    listRestaurants: function () {
      return sb.from('restaurants').select('id, slug, info, active, created_at, menu')
        .order('created_at', { ascending: true })
        .then(function (r) {
          if (r.error) throw r.error;
          return r.data.map(function (x) {
            return {
              id: x.id, slug: x.slug, active: x.active,
              info: Object.assign(clone(DEFAULT_INFO), x.info || {}),
              items: (x.menu && x.menu.items) ? x.menu.items.length : 0
            };
          });
        });
    },
    createRestaurant: function (name, slug, tables, menu) {
      return rpc('admin_create_restaurant', { p_name: name, p_slug: slug, p_tables: tables, p_menu: menu || null });
    },
    setActive: function (id, active) { return rpc('admin_set_active', { p_restaurant: id, p_active: active }); },
    // Suspension (impayé…) : plus de commandes, plus d'accès au dashboard pour l'équipe du restaurant.
    suspend: function (id, reason) { return rpc('admin_suspend', { p_restaurant: id, p_reason: reason || '' }); },
    listMembers: function (id) { return rpc('admin_list_members', { p_restaurant: id }); },
    // Poste d'un compte équipe : 'cuisine', 'bar' ou 'all' (dates limites).
    setStation: function (id, user, station) { return rpc('set_member_station', { p_restaurant: id, p_user: user, p_station: station }); },
    addMember: function (id, email, role) { return rpc('admin_add_member', { p_restaurant: id, p_email: email, p_role: role }); },
    removeMember: function (id, userId) { return rpc('admin_remove_member', { p_restaurant: id, p_user: userId }); },
    // { restaurant_id: { plan, monthly_price, status, next_billing, notes } }
    listBilling: function () {
      return sb.from('restaurant_billing').select('*').then(function (r) {
        if (r.error) throw r.error;
        var map = {};
        (r.data || []).forEach(function (b) { map[b.restaurant_id] = b; });
        return map;
      });
    },
    saveBilling: function (row) {
      row.updated_at = new Date().toISOString();
      return sb.from('restaurant_billing').upsert(row).select('restaurant_id').then(function (r) {
        if (r.error) throw r.error;
      });
    },
    seedDemo: function (id, days) { return rpc('admin_seed_demo_orders', { p_restaurant: id, p_days: days || 30 }); },
    clearDemo: function (id) { return rpc('admin_clear_demo_orders', { p_restaurant: id }); }
  };

  /* ---------------- Démarrage ---------------- */
  T.ready = loadScript(SUPABASE_JS).then(function () {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  });
})();
