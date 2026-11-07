import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(read('js/engine.js'), sandbox, { filename: 'js/engine.js' });
const E = sandbox.window.Engine;

const app = read('js/app.js');
const html = read('index.html');
const css = read('style.css');

test('движок отдаёт трёх капитанов с уникальными id и актами', () => {
  assert.equal(E.CAPTAINS.length, 3);
  const ids = E.CAPTAINS.map((c) => c.id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(E.CAPTAINS.map((c) => c.act).join(','), '1,2,3');
  assert.equal(E.CAPTAINS.map((c) => c.passive).join(','),
    'first-hit-extra,reveal-one,smoke-longer');
  for (const captain of E.CAPTAINS) {
    assert.ok(captain.name);
    assert.ok(captain.desc);
    assert.match(captain.unlock, /^act[123]$/);
    assert.equal(E.captainById(captain.id), captain);
  }
  assert.equal(E.captainById('unknown'), null);
  assert.equal(E.captainsForAct(2).map((c) => c.id).join(','), 'navigator');
});

test('капитаны открываются по актам', () => {
  const empty = {};
  assert.equal(E.captainUnlocked(empty, 'bosun'), true);
  assert.equal(E.captainUnlocked(empty, 'navigator'), false);
  assert.equal(E.captainUnlocked(empty, 'mechanic'), false);

  const act1 = { completed: [1, 2, 3, 4] };
  assert.equal(E.captainUnlocked(act1, 'navigator'), true);
  assert.equal(E.captainUnlocked(act1, 'mechanic'), false);

  const act2 = { completed: [1, 2, 3, 4, 5, 6, 7, 8] };
  assert.equal(E.captainUnlocked(act2, 'mechanic'), true);

  // Гибкий формат прогресса: объект со звёздами и id миссий.
  assert.equal(E.captainUnlocked({ stars: { 4: 3 } }, 'navigator'), true);
  assert.equal(E.captainUnlocked([{ id: 8, completed: true }], 'mechanic'), true);
  assert.equal(E.captainUnlocked(empty, 'unknown'), false);
});

test('пассивка Боцмана даёт один бонусный выстрел за первое попадание', () => {
  assert.equal(E.captainFirstHitExtra('bosun', true, false), true);
  assert.equal(E.captainFirstHitExtra('bosun', true, true), false);
  assert.equal(E.captainFirstHitExtra('bosun', false, false), false);
  assert.equal(E.captainFirstHitExtra('navigator', true, false), false);
  assert.equal(E.captainPassive('bosun', 'first-hit-extra'), true);
  assert.equal(E.captainPassive('bosun', 'reveal-one'), false);
});

test('пассивка Штурмана открывает ровно одну клетку корабля', () => {
  const board = E.randomBoard(E.fleetFor(8, 'classic'), 8);
  assert.equal(E.captainRevealCell('bosun', board), null);
  const cell = E.captainRevealCell('navigator', board, () => 0);
  assert.ok(cell);
  assert.notEqual(board.grid[cell.y][cell.x], -1, 'клетка должна принадлежать кораблю');
  assert.equal(board.shots[cell.y][cell.x], null);
  assert.equal(E.captainRevealCell('navigator', null), null);
});

test('пассивка Механика продлевает дым только при модификаторе smoke', () => {
  const withSmoke = { mods: ['smoke'] };
  const withoutSmoke = { mods: ['fog'] };
  assert.equal(E.captainSmokeTurns('mechanic', withSmoke, 3), 4);
  assert.equal(E.captainSmokeTurns('mechanic', withoutSmoke, 3), 3);
  assert.equal(E.captainSmokeTurns('bosun', withSmoke, 3), 3);
  assert.equal(E.captainSmokeTurns('mechanic', withSmoke, 5), 6);

  const board = E.createBoard(10);
  const res = E.placeSmoke(board, 5, 5, 4);
  assert.equal(res.ok, true);
  assert.equal(res.turnsLeft, 4);
  assert.equal(board.smoke[0].turnsLeft, 4);
  assert.equal(E.placeSmoke(E.createBoard(10), 5, 5).turnsLeft, 3);
});

test('пассивки не влияют на ELO и рейтинговые бои', () => {
  const base = E.eloDelta(1000, 1000, true);
  assert.equal(E.eloDelta(1000, 1000, true), base);
  assert.equal(typeof E.isRatedBattle, 'function');
  // В обычном бою и онлайне state.campaign пуст, поэтому капитан не активен.
  assert.match(app, /function activeCaptain\(\) \{\s*if \(!state\.campaign \|\| state\.mode !== 'bot'\) return null;/);
  assert.match(app, /const captain = state\.campaign && state\.mode === 'bot'/);
});

test('экран кампании хранит выбор капитана и показывает карточки', () => {
  assert.match(html, /id="campaign-captains"/);
  for (const id of ['bosun', 'navigator', 'mechanic']) {
    assert.match(html, new RegExp('data-captain="' + id + '"'));
  }
  assert.match(app, /function renderCaptains\(\)/);
  assert.match(app, /function selectCaptain\(id\)/);
  assert.match(app, /campaign\.captain = captain\.id/);
  assert.match(app, /state\.profile\.campaign\.captain = captain\.id/);
  assert.match(app, /captain: state\.captain \|\| ''/);
  assert.match(app, /state\.captain = state\.profile\.campaign\.captain \|\| 'bosun'/);
  assert.match(app, /renderCaptains\(\);\s*renderCampaignDaily\(\);/);
  assert.match(app, /case 'is-locked'|classList\.toggle\('is-locked'/);
  assert.match(css, /\.campaign-captain\.is-selected/);
  assert.match(css, /\.campaign-captain\.is-locked/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{[\s\S]*?\.campaign-captain\{transition:none\}/);
  assert.match(css, /\.cell\.is-captain-reveal/);
});

test('результат кампании показывает капитана и PWA-кэш поднят', () => {
  assert.match(app, /Капитан: ' \+ cap\.name \+ ' · ' \+ cap\.desc/);
  assert.match(read('sw.js'), /const VERSION = 'sb-v44'/);
  assert.match(app, /const SW_VERSION = 'sb-v44'/);
});
