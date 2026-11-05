import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('нерейтинговый бой замораживает прогресс', () => {
  const app = read('js/app.js');
  assert.match(app, /isRatedBattle\(\)/);
  assert.match(app, /rated: false/);
  assert.match(app, /Без рейтинга/);
});

test('онлайн-топ только для классики', () => {
  const app = read('js/app.js');
  assert.match(app, /function isClassicConfig/);
  assert.match(app, /isClassicConfig\(state\.config\)/);
});

test('бейдж результата есть в разметке', () => {
  const html = read('index.html');
  assert.match(html, /id="result-rated"/);
});
