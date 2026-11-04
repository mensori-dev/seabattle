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

test('светлая тема: свои корабли тёмные и контрастные, а не белые', () => {
  const css = read('style.css');
  assert.match(css, /html\.theme-light \.cell\{\s*background:linear-gradient/);
  assert.doesNotMatch(css, /html\.theme-light \.cell\{background:rgba\(255,255,255,\.4\)/);
  assert.match(css, /html\.theme-light \.cell\.ship\{\s*background:/);
  assert.match(css, /html\.theme-light \.ship-blocks i\{\s*background:/);
});

test('светлая тема: призрак и выбранный корабль подсвечены', () => {
  const css = read('style.css');
  assert.match(css, /html\.theme-light \.cell\.ghost-ok\{\s*background:/);
  assert.match(css, /html\.theme-light \.cell\.ghost-bad\{\s*background:/);
  assert.match(css, /html\.theme-light \.screen-place\.is-ship-edit \.board-place \.cell\.ship-selected\{/);
});

test('AMOLED тема: чёрный фон и свой переключатель', () => {
  const css = read('style.css');
  const html = read('index.html');
  const app = read('js/app.js');
  assert.match(css, /html\.theme-amoled\{/);
  assert.match(css, /html\.theme-amoled body\{\s*background:#000/);
  assert.match(html, /data-theme="amoled"/);
  assert.match(app, /theme-amoled/);
});

test('AMOLED тема: призрак и выбранный корабль подсвечены', () => {
  const css = read('style.css');
  assert.match(css, /html\.theme-amoled \.cell\.ghost-ok\{\s*background:/);
  assert.match(css, /html\.theme-amoled \.cell\.ghost-bad\{\s*background:/);
  assert.match(css, /html\.theme-amoled \.screen-place\.is-ship-edit \.board-place \.cell\.ship-selected\{/);
});
