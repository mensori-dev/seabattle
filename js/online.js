/* ============================================================
   Онлайн-клиент «Морского боя»: WebSocket + комнаты по коду.
   Классический IIFE — чтобы игра открывалась и как file://.
   ============================================================ */
(function (global) {
  'use strict';

  /* Адрес сервера после деплоя на Deno Deploy, например:
     var PROD_URL = 'wss://seabattle-online.deno.dev/ws';            */
  var PROD_URL = '';

  var ws = null;
  var handlers = {};

  function target() {
    if (PROD_URL) return PROD_URL;
    var loc = global.location;
    var local = loc.protocol === 'file:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
    return local ? 'ws://127.0.0.1:8000/ws' : null;
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
      if (ws && ws.readyState <= 1) { resolve(); return; }

      var sock;
      try { sock = new WebSocket(url); } catch (e) { reject(e); return; }
      ws = sock;

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { sock.close(); } catch (e) { /* ignore */ }
        reject(new Error('Сервер не отвечает'));
      }, 8000);

      sock.onopen = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      sock.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('Не удалось подключиться'));
      };
      sock.onclose = function () {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('Соединение закрыто'));
        }
        emit('closed', {});
      };
      sock.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg && msg.t) emit(msg.t, msg);
      };
    });
  }

  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  global.Online = {
    connect: connect,
    available: function () { return !!target(); },
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
      send({ t: 'leave' });
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    }
  };
})(window);
