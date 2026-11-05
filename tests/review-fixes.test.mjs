import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('онлайн-бар способностей рисует лоадаут из комнаты', () => {
  const app = read('js/app.js');
  assert.match(app, /state\.mode === 'online' && state\.net && Array\.isArray\(state\.net\.loadout\)/);
});

test('ПВО защитника списывает заряд на клиенте', () => {
  const app = read('js/app.js');
  assert.match(app, /msg\.kind === 'aa'[\s\S]*?msg\.owner === state\.net\.you[\s\S]*?state\.abilities\.aa = 0/);
});

test('локальный бой пропускает ход, когда всё поле под дымом', () => {
  const app = read('js/app.js');
  assert.match(app, /Engine\.legalShots\(state\.enemyBoard\)\.length === 0/);
});

test('профиль из localStorage нормализует числа, историю и цепочку дня', () => {
  const app = read('js/app.js');
  assert.match(app, /function normalizeHistory/);
  assert.match(app, /toInt\(p\.rating/);
  assert.match(app, /toInt\(h\.delta/);
  assert.match(app, /prof\.cup = \{/);
  assert.match(app, /config: normalizeConfig\(cupConfig, 'classic'\)/);
});

test('сборка Яндекса исправляет стартовый счётчик достижений', () => {
  const build = read('scripts/build-yandex.mjs');
  assert.match(build, /id="ach-count">0 \/ 11</);
  assert.match(build, /id="ach-count">0 \/ 10</);
});

test('повторный create/join получает ошибку, а не тишину', () => {
  const server = read('server/main.ts');
  assert.match(server, /type === 'create'[\s\S]*?Ты уже в комнате/);
  assert.match(server, /type === 'join'[\s\S]*?Ты уже в комнате/);
});
