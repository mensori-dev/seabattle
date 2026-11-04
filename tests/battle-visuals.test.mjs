import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('попадание и потопление различаются значками', () => {
  const css = read('style.css');
  assert.match(css, /\.cell\.hit::after/);
  assert.match(css, /\.cell\.sunk::after/);
  assert.ok(css.includes("content:'✸'"));
  assert.ok(css.includes("content:'☠'"));
});

test('под полем соперника есть легенда с теми же значками', () => {
  const html = read('index.html');
  assert.match(html, /shot-legend/);
  assert.match(html, /✸/);
  assert.match(html, /☠/);
});

test('клетки получают data-result и aria-label', () => {
  const app = read('js/app.js');
  assert.match(app, /dataset\.result/);
  assert.match(app, /aria-label/);
  assert.match(app, /корабль потоплен/);
});

test('светлая тема не затирает фон попадания и потопления', () => {
  const css = read('style.css');
  // `html.theme-light .cell` специфичнее `.cell.hit` и перебивал его фон
  assert.match(css, /html\.theme-light \.cell\.hit\{background:/);
  assert.match(css, /html\.theme-light \.cell\.sunk\{background:/);
});

test('панель редактора в светлой теме и выше тостов', () => {
  const css = read('style.css');
  assert.match(css, /html\.theme-light \.ship-editor-panel\{\s*background:/);
  assert.match(css, /\.ship-editor\{position:fixed;inset:0;z-index:61;/);
});
