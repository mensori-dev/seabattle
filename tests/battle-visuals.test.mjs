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

test('снаряд летит от доски стрелка к клетке', () => {
  const app = read('js/app.js');
  const css = read('style.css');
  assert.match(app, /function launchShell\(/);
  assert.match(app, /doShot\(boards\.enemy, state\.enemyBoard, x, y, false, boards\.own\)/);
  assert.match(app, /doShot\(boards\.own, state\.playerBoard, move\.x, move\.y, true, boards\.enemy\)/);
  assert.match(css, /\.shell\{/);
  assert.match(css, /@keyframes impactRing/);
});

test('результат боя показывает точность, выстрелы, время и серию', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  for (const id of ['res-acc', 'res-shots', 'res-time', 'res-streak']) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.match(app, new RegExp("\\$\\('#" + id + "'\\)"));
  }
  assert.match(app, /function shareResult\(/);
  assert.match(html, /id="btn-share-result"/);
});

test('первый бой подсказывает, как стрелять, и подсказка не возвращается', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  assert.match(html, /id="battle-hint"/);
  assert.match(app, /function updateBattleHint\(/);
  assert.match(app, /profile\.hintSeen = true/);
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

test('скины и AMOLED не перебивают фон попадания и потопления', () => {
  const css = read('style.css');
  assert.match(css, /\.cell\.ship\.v:not\(\.hit\):not\(\.sunk\)/);
  for (const skin of ['grid', 'cyber', 'navy']) {
    assert.match(css, new RegExp('html\\.skin-' + skin + ' \\.cell\\.ship:not\\(\\.hit\\):not\\(\\.sunk\\)'));
  }
  assert.match(css, /html\.theme-amoled \.cell\.ship:not\(\.hit\):not\(\.sunk\)/);
});

test('старт из «Настроить» не продолжает испытание дня', () => {
  const app = read('js/app.js');
  assert.match(app, /btn-setup-go[\s\S]{0,220}state\.cupMatch = false/);
  assert.match(app, /const wasCup = state\.cupMatch/);
});

test('онлайн не отправляет выстрел по дыму и не залипает на плохих координатах', () => {
  const app = read('js/app.js');
  assert.match(app, /function netSmokeBlocks\(/);
  assert.match(app, /Engine\.smokeBlocks\(state\.enemyBoard, x, y\) \|\| netSmokeBlocks\(x, y\)/);
  assert.match(app, /if \(x < 0 \|\| y < 0 \|\| x >= state\.size \|\| y >= state\.size\) return;\s*\n\s*clearNetShotTimeout\(\)/);
});

test('счётчик достижений в разметке и сборках совпадает с реальным', () => {
  const app = read('js/app.js');
  const html = read('index.html');
  const count = (app.match(/^\s*\{ id: '[^']+', icon:/gm) || []).length;
  assert.match(html, new RegExp('id="ach-count">0 / ' + count + '<'));
  assert.match(html, new RegExp(count + ' медалей'));
  for (const file of ['scripts/build-yandex.mjs', 'scripts/build-gamepush.mjs']) {
    const build = read(file);
    assert.match(build, new RegExp('id="ach-count">0 / ' + count + '<'));
    assert.match(build, new RegExp('0 / ' + (count - 1) + '<'));
  }
});
