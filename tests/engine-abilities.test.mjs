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

test('areaCells: 3×3 по центру, отказ у края, 2×2 прижимается', () => {
  assert.equal(E.areaCells(10, 3, 5, 5).length, 9);
  assert.ok(E.areaCells(10, 3, 5, 5).some((c) => c.x === 5 && c.y === 5));
  assert.equal(E.areaCells(10, 3, 0, 0).length, 0);
  const corner = E.areaCells(10, 2, 9, 9);
  assert.equal(corner.length, 4);
  assert.equal(corner.map((c) => `${c.x},${c.y}`).sort().join('|'), '8,8|8,9|9,8|9,9');
  assert.equal(E.abilitySide(8), 2);
  assert.equal(E.abilitySide(10), 3);
  assert.equal(E.abilitySide(12), 3);
});

test('авиаудар бьёт все необстрелянные клетки области и не даёт второго', () => {
  const board = E.createBoard(10);
  E.placeShip(board, 4, 4, 3, true);
  const r = E.airstrike(board, 5, 5);
  assert.equal(r.ok, true);
  const sunk = r.cells.filter((c) => c.result === 'sunk');
  assert.ok(sunk.length >= 1);
  assert.equal(r.cells.length, 9);
  assert.equal(E.airstrike(board, 5, 5).ok, false);
});

test('дым запрещает выстрел, но пропускает авиаудар', () => {
  const board = E.createBoard(10);
  E.placeShip(board, 4, 4, 3, true);
  assert.equal(E.placeSmoke(board, 4, 4).ok, true);
  assert.equal(E.smokeBlocks(board, 4, 4), true);
  assert.equal(E.fire(board, 4, 4), null);
  const r = E.airstrike(board, 5, 5);
  assert.equal(r.ok, true);
  assert.ok(r.cells.some((c) => c.result === 'sunk'));
});

test('дым живёт три тика и не ставится на полностью обстрелянную зону', () => {
  const board = E.createBoard(10);
  E.placeSmoke(board, 4, 4);
  assert.equal(E.tickSmoke(board), 0);      // 3 → 2
  assert.equal(E.smokeBlocks(board, 4, 4), true);
  assert.equal(E.tickSmoke(board), 0);      // 2 → 1
  assert.equal(E.tickSmoke(board), 1);      // 1 → 0, зона удалена
  assert.equal(E.smokeBlocks(board, 4, 4), false);
  assert.equal(E.placeSmoke(board, 4, 4).ok, true);
});

test('legalShots исключает задымлённые клетки', () => {
  const board = E.createBoard(8);
  E.placeSmoke(board, 3, 3);
  const shots = E.legalShots(board);
  assert.equal(shots.length, 64 - 4);
  assert.ok(!shots.some((c) => c.x >= 3 && c.x <= 4 && c.y >= 3 && c.y <= 4));
});

test('лоудаут выдаёт по одному заряду только выбранным способностям', () => {
  assert.deepEqual(
    { ...E.newAbilityState(['airstrike', 'smoke']) },
    { airstrike: 1, smoke: 1 }
  );
  assert.deepEqual({ ...E.newAbilityState(['aa', 'smoke']) }, { aa: 1, smoke: 1 });
});
