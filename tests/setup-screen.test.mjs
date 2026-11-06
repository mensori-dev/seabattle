import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('перед расстановкой есть отдельный экран подготовки', () => {
  const html = read('index.html');
  assert.match(html, /id="screen-setup"/);
  assert.match(html, /id="btn-setup-back"/);
  assert.match(html, /id="btn-setup-go"/);
  for (const id of ['set-skin', 'set-water', 'set-size', 'set-fleet', 'set-tactics', 'set-difficulty']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('быстрый бой стартует сразу, а «Настроить бой» ведёт на подготовку', () => {
  const app = read('js/app.js');
  const html = read('index.html');
  assert.match(app, /#btn-play'\)\.addEventListener\('click',[\s\S]{0,220}startMatch\(\)/);
  assert.match(app, /#btn-setup'\)\.addEventListener\('click',[\s\S]{0,160}showScreen\('setup'\)/);
  assert.match(app, /#btn-setup-go'\)\.addEventListener\('click',[\s\S]{0,200}state\.cupMatch = false;[\s\S]{0,80}startMatch\(\)/);
  assert.match(app, /menu: 1, online: 1, setup: 1, place: 1, prepare: 1, battle: 1/);
  assert.match(html, /id="quick-sub"/);
  assert.match(html, /class="battle-hub"/);
});

test('из расстановки бот-матча можно вернуться к настройкам боя', () => {
  const app = read('js/app.js');
  assert.match(app, /state\.mode === 'bot' && !state\.cupMatch[\s\S]{0,320}showScreen\('setup'\)/);
  // «Быстрый бой» начат из меню — назад тоже в меню.
  assert.match(app, /state\.quickBattle[\s\S]{0,120}showScreen\('menu'\)/);
});

test('шторм больше не дёргается: плавный transform вместо старого дождя', () => {
  const css = read('style.css');
  assert.doesNotMatch(css, /rainSlide/);
  assert.match(css, /html\.water-storm \.ocean::after/);
  assert.match(css, /@keyframes stormBoard\{from\{transform:translate3d/);
  assert.match(css, /@keyframes stormClouds\{from\{transform:translate3d/);
});

test('шторм рисует слоистые волны и редкую молнию', () => {
  const html = read('index.html');
  const css = read('style.css');
  assert.match(html, /id="storm"/);
  assert.match(html, /id="storm-wave-a"/);
  assert.equal((html.match(/class="storm-wave w\d"/g) || []).length, 4);
  assert.equal((html.match(/use href="#storm-wave-[a-d]"/g) || []).length, 8);
  assert.match(css, /\.storm\{display:none/);
  assert.match(css, /html\.water-storm \.storm\{display:block\}/);
  assert.match(css, /@keyframes stormDrift\{from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(-50%,0,0\)\}\}/);
  assert.match(css, /@keyframes stormFlash\{/);
  assert.match(css, /html\.water-storm \.bubble\{display:none\}/);
  assert.match(css, /prefers-reduced-motion[^}]*\.storm-track|\.storm-track[^}]*prefers-reduced-motion/s);
});
