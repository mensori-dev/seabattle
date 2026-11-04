/* ============================================================
   Приватность: без внешних шрифтов, сервер не хранит ПДн.
   Проверяем исходники, а не поведение в браузере: так регрессия
   видна сразу в `npm test`.
   ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('веб-версия не запрашивает Google Fonts', () => {
  for (const page of ['index.html', 'privacy.html', 'site/index.html']) {
    assert.doesNotMatch(read(page), /fonts\.(googleapis|gstatic)\.com/, page);
  }
});

test('шрифты лежат локально и попадают в офлайн-кэш', () => {
  for (const page of ['index.html', 'privacy.html']) {
    assert.match(read(page), /assets\/fonts\/fonts\.css/, page);
  }
  const sw = read('sw.js');
  for (const file of ['fonts.css', 'nunito-cyrillic.woff2', 'rubik-cyrillic.woff2']) {
    assert.ok(sw.includes('assets/fonts/' + file), 'в CORE нет ' + file);
  }
});

test('онлайн-сервер не пишет персональные данные в базу', () => {
  const server = read('server/main.ts');
  assert.doesNotMatch(server, /openKv|Deno\.Kv/);
  assert.match(server, /const memWins = new Map/);
  const pkg = JSON.parse(read('package.json'));
  assert.ok(!pkg.scripts.server.includes('--unstable-kv'), 'в npm run server остался --unstable-kv');
});

test('политика описывает топ в памяти, а не в базе', () => {
  const html = read('privacy.html');
  assert.doesNotMatch(html, /Deno KV/);
  assert.match(html, /топ обнуляется/);
  assert.match(html, /В базу данных сервер ничего не пишет/);
});

test('личный счёт онлайн-побед хранится на устройстве', () => {
  const app = read('js/app.js');
  assert.match(app, /onlineWins: 0/);
  assert.match(app, /p\.onlineWins = \(p\.onlineWins \|\| 0\) \+ 1/);
  assert.match(read('index.html'), /id="online-mine"/);
});
