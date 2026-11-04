import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('в настройках есть звуки, музыка и её громкость', () => {
  const html = read('index.html');
  for (const id of ['set-sfx', 'set-music', 'set-music-volume', 'set-music-volume-val']) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /js\/music\.js/);
});

test('профиль хранит музыку и громкость', () => {
  const app = read('js/app.js');
  assert.match(app, /music:\s*true/);
  assert.match(app, /musicVolume:\s*0\.5/);
  assert.match(app, /Music\.setEnabled/);
  assert.match(app, /Music\.setVolume/);
  assert.match(app, /Music\.duck/);
  assert.match(app, /Music\.pause/);
});

test('кнопка звука в шапке управляет обоими каналами', () => {
  const app = read('js/app.js');
  assert.match(app, /const anyOn = /);
  assert.match(app, /state\.profile\.music = next/);
});
