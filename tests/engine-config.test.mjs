import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8'), sandbox);
const E = sandbox.window.Engine;

test('три размера поля и пресеты флота', () => {
  assert.deepEqual([...E.CONFIG.sizes], [8, 10, 12]);
  assert.deepEqual([...E.fleetsFor(8).classic], [3, 2, 2, 2, 1, 1, 1]);
  assert.equal(E.fleetsFor(8).admiral, null);
  assert.equal(E.fleetFor(10, 'admiral').length, 11);
  const adm12 = E.fleetFor(12, 'admiral');
  assert.equal(adm12.length, 13);
  assert.equal(adm12.reduce((a, b) => a + b, 0), 31);
});

test('доска хранит свой размер и рисует сетку по нему', () => {
  const board = E.createBoard(8);
  assert.equal(board.size, 8);
  assert.equal(board.grid.length, 8);
  assert.equal(board.grid[0].length, 8);
  assert.equal(E.createBoard().size, 10);
});

test('randomBoard ставит флот в границах своего размера', () => {
  for (const [size, key] of [[8, 'classic'], [12, 'classic'], [12, 'admiral']]) {
    const fleet = E.fleetFor(size, key);
    const board = E.randomBoard(fleet, size);
    assert.equal(E.totalShips(board), fleet.length);
    for (const ship of board.ships) {
      for (const c of ship.cells) {
        assert.ok(c.x >= 0 && c.y >= 0 && c.x < size && c.y < size);
      }
    }
  }
});

test('поворот корабля у края 12×12 не вылезает за поле', () => {
  const board = E.createBoard(12);
  const ship = E.placeShip(board, 9, 10, 3, true);
  const r = E.rotateShip(board, ship.id, 'right');
  assert.equal(r.ok, true);
  for (const c of r.ship.cells) assert.ok(c.y < 12 && c.x < 12);
});

test('выстрел за границей 8×8 отклоняется', () => {
  const board = E.createBoard(8);
  assert.equal(E.fire(board, 8, 0), null);
  assert.equal(E.fire(board, 0, 8), null);
});

test('бот на 8×8 выбирает только клетки своего поля', () => {
  const board = E.createBoard(8);
  const bot = new E.Bot('normal');
  for (let i = 0; i < 200; i++) {
    const m = bot.choose(board);
    assert.ok(m.x >= 0 && m.y >= 0 && m.x < 8 && m.y < 8);
  }
});

test('рейтинговый бой — только 10×10 без тактики', () => {
  const base = { size: 10, fleet: 'classic', tactics: false };
  assert.equal(E.isRatedBattle('bot', base), true);
  assert.equal(E.isRatedBattle('bot', { ...base, fleet: 'admiral' }), true);
  assert.equal(E.isRatedBattle('bot', { ...base, size: 8 }), false);
  assert.equal(E.isRatedBattle('bot', { ...base, tactics: true }), false);
  assert.equal(E.isRatedBattle('online', base), false);
});
