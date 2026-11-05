import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('есть отдельный экран подготовки с карточками', () => {
  const html = read('index.html');
  assert.match(html, /id="screen-prepare"/);
  assert.match(html, /id="prep-cards"/);
  assert.match(html, /id="btn-prep-go"/);
  assert.match(html, /Выбери две способности/);
});

test('карточки доступны с клавиатуры и уважают reduced-motion', () => {
  const app = read('js/app.js');
  const css = read('style.css');
  assert.match(app, /aria-pressed/);
  assert.match(app, /data-ability/);
  assert.match(css, /\.prep-card\.is-on/);
  assert.match(css, /prefers-reduced-motion[^}]*\.prep-card|\.prep-card[^}]*prefers-reduced-motion/s);
});

test('панель способностей появляется в бою', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  assert.match(html, /id="ability-bar"/);
  assert.match(app, /state\.pendingAbility/);
  assert.match(app, /Engine\.airstrike/);
  assert.match(app, /Engine\.placeSmoke/);
});

test('лоудаут по умолчанию — авиаудар и дым', () => {
  const app = read('js/app.js');
  assert.match(app, /'airstrike',\s*'smoke'|\["airstrike",\s*"smoke"\]/);
});
