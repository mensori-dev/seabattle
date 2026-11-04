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
