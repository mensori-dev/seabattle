import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('сетка доски масштабируется переменной --n', () => {
  const css = read('style.css');
  assert.match(css, /grid-template-columns:repeat\(var\(--n,\s*10\),\s*1fr\)/);
});

test('app.js не рисует доску по зашитой десятке', () => {
  const app = read('js/app.js');
  assert.doesNotMatch(app, /Engine\.SIZE/);
  assert.match(app, /style\.setProperty\('--n'/);
  assert.match(app, /state\.size/);
});

test('в настройках есть поле и тактика, настройки бота сохраняются', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  assert.match(html, /data-size="8"/);
  assert.match(html, /data-size="12"/);
  assert.match(html, /data-tactics="on"/);
  assert.match(app, /botConfig/);
  assert.match(app, /isRatedBattle\(\)/);
});
