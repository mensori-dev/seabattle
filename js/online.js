/* ============================================================
   Онлайн-клиент «Морского боя»: WebSocket + комнаты по коду.
   Классический IIFE — чтобы игра открывалась и как file://.
   ============================================================ */
(function (global) {
  'use strict';

  /* Адрес сервера после деплоя на Deno Deploy. */
  var PROD_URL = 'wss://mensori-seabattle.mensori-dev.deno.net/ws';

  var ws = null;
  var handlers = {};
  var heartbeat = null;
  var lastPong = 0;

  /* Сердцебиение: раз в 20 секунд ping. В скрытой вкладке молчим,
     чтобы браузер не будил телефон зря; после возврата — сразу ping.
     Если pong не пришёл 45 секунд, сокет считается мёртвым. */
  function startHeartbeat() {
    if (heartbeat) return;
    lastPong = Date.now();
    heartbeat = setInterval(function () {
      if (!ws || ws.readyState !== 1) return;
      if (typeof global.document !== 'undefined' && global.document && global.document.hidden) return;
      if (Date.now() - lastPong > 45000) {
        try { ws.close(); } catch (e) { /* ignore */ }
        return;
      }
      send({ t: 'ping' });
    }, 20000);
  }

  function stopHeartbeat() {
    if (heartbeat) {
      try { clearInterval(heartbeat); } catch (e) { /* ignore */ }
      heartbeat = null;
    }
  }

  function target() {
    var loc = global.location;
    // Локальный сервер (`npm run server`) — только для http-разработки.
    // В APK Capacitor отдаёт игру с https://localhost, и это НЕ локальная
    // разработка: раньше такой адрес уводил сокет на ws://127.0.0.1:8000,
    // отсюда «нет подключения к интернету» при создании комнаты.
    var host = loc.hostname;
    var isDevHost = host === 'localhost' || host === '127.0.0.1';
    if (isDevHost && loc.protocol === 'http:') return 'ws://127.0.0.1:8000/ws';
    return PROD_URL || null;
  }

  /* HTTP-адрес того же сервера (рейтинг, служебные ручки). */
  function httpUrl(path) {
    var ws = target();
    if (!ws) return null;
    var base = ws.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/ws$/, '');
    return base + path;
  }

  function emit(type, payload) {
    var list = handlers[type] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (e) { console.error(e); }
    }
  }

  function connect() {
    return new Promise(function (resolve, reject) {
      var url = target();
      if (!url) {
        reject(new Error('Онлайн ещё не настроен'));
        return;
      }
      if (ws && ws.readyState === 1) { resolve(); return; }

      // Если сокет ещё подключается — ждём его open, а не создаём второй.
      var sock = ws && ws.readyState === 0 ? ws : null;
      if (!sock) {
        try { sock = new WebSocket(url); } catch (e) { reject(e); return; }
        ws = sock;
      }

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { sock.close(); } catch (e) { /* ignore */ }
        reject(new Error('Сервер не отвечает'));
      }, 8000);

      var onOpen = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sock.removeEventListener('open', onOpen);
        sock.removeEventListener('error', onError);
        resolve();
      };
      var onError = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stopHeartbeat();
        sock.removeEventListener('open', onOpen);
        sock.removeEventListener('error', onError);
        reject(new Error('Не удалось подключиться'));
      };

      if (sock.readyState === 1) { onOpen(); return; }
      sock.addEventListener('open', onOpen);
      sock.addEventListener('error', onError);

      sock.onclose = function () {
        // Старый сокет мог закрыться уже после реконнекта: его события
        // не должны рвать новый матч и показывать «соединение потеряно».
        if (ws !== sock) return;
        stopHeartbeat();
        ws = null;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('Соединение закрыто'));
        }
        emit('closed', {});
      };
      sock.onmessage = function (ev) {
        if (ws !== sock) return;
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg || !msg.t) return;
        if (msg.t === 'pong') { lastPong = Date.now(); return; }
        if (msg.t === 'room') startHeartbeat();
        emit(msg.t, msg);
      };
    });
  }

  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  global.Online = {
    connect: connect,
    available: function () { return !!target(); },
    httpUrl: httpUrl,
    isOpen: function () { return !!(ws && ws.readyState === 1); },
    on: function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    off: function (type, fn) {
      var list = handlers[type] || [];
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    create: function (name, rating) { send({ t: 'create', name: name, rating: rating }); },
    join: function (code, name, rating) { send({ t: 'join', code: code, name: name, rating: rating }); },
    fleet: function (ships) { send({ t: 'fleet', ships: ships }); },
    shot: function (x, y) { send({ t: 'shot', x: x, y: y }); },
    surrender: function () { send({ t: 'surrender' }); },
    leave: function () {
      stopHeartbeat();
      send({ t: 'leave' });
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    },
    ping: function () {
      lastPong = Date.now();
      send({ t: 'ping' });
    }
  };

  /* Вернулись во вкладку — сразу сообщаем серверу, что мы живы. */
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden) return;
      lastPong = Date.now();
      if (ws && ws.readyState === 1) send({ t: 'ping' });
    });
  }
})(window);
