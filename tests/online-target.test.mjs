/* ============================================================
   Адрес онлайн-сервера: локальный только для http-разработки.
   Регрессия APK: Capacitor открывает игру с https://localhost,
   и этот адрес нельзя считать локальной разработкой.
   ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js', 'online.js'), 'utf8');

/* Загружает классический IIFE в песочницу с поддельным location. */
function loadOnline(protocol, hostname) {
  const window = {
    location: { protocol, hostname },
    WebSocket: function () {},
    console
  };
  const ctx = vm.createContext({ window, console, setTimeout, clearTimeout });
  vm.runInContext(source, ctx, { filename: 'js/online.js' });
  return window.Online;
}

const PROD_HTTP = 'https://mensori-seabattle.mensori-dev.deno.net';

test('APK: https://localhost идёт на прод-сервер, а не на 127.0.0.1', () => {
  const online = loadOnline('https:', 'localhost');
  assert.equal(online.httpUrl('/health'), PROD_HTTP + '/health');
  assert.equal(online.httpUrl('/ws'), PROD_HTTP + '/ws');
});

test('локальная разработка по http остаётся на 127.0.0.1:8000', () => {
  for (const host of ['localhost', '127.0.0.1']) {
    const online = loadOnline('http:', host);
    assert.equal(online.httpUrl('/health'), 'http://127.0.0.1:8000/health', host);
  }
});

test('сайт, GitHub Pages и file:// используют прод-сервер', () => {
  const cases = [
    ['https:', 'mensori-dev.github.io'],
    ['https:', 'example.com'],
    ['file:', '']
  ];
  for (const [protocol, hostname] of cases) {
    const online = loadOnline(protocol, hostname);
    assert.equal(online.httpUrl('/health'), PROD_HTTP + '/health', protocol + '//' + hostname);
  }
});

/* ---------- Сокет: heartbeat и защита от старого соединения ---------- */

class FakeWS {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = {};
    FakeWS.last = this;
    FakeWS.all.push(this);
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((x) => x !== fn);
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() {
    this.readyState = 1;
    (this.listeners.open || []).forEach((fn) => fn());
  }
  message(obj) {
    (this.listeners.message || []).forEach((fn) => fn({ data: JSON.stringify(obj) }));
  }
}
FakeWS.all = [];

function loadWithSocket(location) {
  FakeWS.all = [];
  const document = { addEventListener() {}, hidden: false };
  const window = {
    location,
    WebSocket: FakeWS,
    console,
    document
  };
  window.window = window;
  const ctx = vm.createContext(Object.assign(window, {
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    Date
  }));
  vm.runInContext(source, ctx, { filename: 'js/online.js' });
  return window.Online;
}

test('закрытие старого сокета не рвёт новый матч', async () => {
  const online = loadWithSocket({ protocol: 'https:', hostname: 'example.com' });
  let closed = 0;
  online.on('closed', () => { closed += 1; });

  const first = online.connect();
  const a = FakeWS.last;
  a.open();
  await first;
  a.message({ t: 'room', code: '1234', you: 0 });

  online.leave();
  const second = online.connect();
  const b = FakeWS.last;
  b.open();
  await second;

  a.onclose();
  assert.equal(closed, 0);
  assert.equal(online.isOpen(), true);
});

test('ping уходит на сервер, когда сокет открыт', async () => {
  const online = loadWithSocket({ protocol: 'https:', hostname: 'example.com' });
  const connecting = online.connect();
  const a = FakeWS.last;
  a.open();
  await connecting;
  online.ping();
  assert.equal(a.sent[a.sent.length - 1], JSON.stringify({ t: 'ping' }));
});

test('heartbeat спит в скрытой вкладке', () => {
  assert.match(source, /document\.hidden/);
  assert.match(source, /visibilitychange/);
});
