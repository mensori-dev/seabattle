import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('онлайн-клиент передаёт конфиг, лоудаут и способности', () => {
  const online = read('js/online.js');
  assert.match(online, /create: function \(name, rating, config\)/);
  assert.match(online, /t: 'loadout'/);
  assert.match(online, /t: 'ability'/);
});

test('экран комнаты умеет настраивать поле, флот и тактику', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  assert.match(html, /id="lobby-config"/);
  assert.match(html, /data-lobby-size/);
  assert.match(html, /data-lobby-tactics/);
  assert.match(app, /state\.net\.config/);
  assert.match(app, /Сервер не обновлён/);
});
