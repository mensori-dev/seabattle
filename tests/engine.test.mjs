import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const E = sandbox.window.Engine;

function sortedSizes(board) {
  return Array.from(board.ships, (s) => s.size).sort((a, b) => b - a);
}

function shipsDoNotTouch(a, b) {
  return a.cells.every((ca) => b.cells.every((cb) => {
    return Math.abs(ca.x - cb.x) > 1 || Math.abs(ca.y - cb.y) > 1;
  }));
}

test('состав флота: 10 кораблей по классическим правилам', () => {
  assert.deepEqual([...E.FLEET], [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]);
  assert.equal(E.SIZE, 10);
});

test('адмиральский флот: 11 кораблей, 24 клетки, флагман на 5', () => {
  assert.deepEqual([...E.FLEETS.admiral], [5, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1]);
  assert.equal(E.FLEETS.admiral.reduce((a, b) => a + b, 0), 24);
  assert.equal(E.SHIP_LABEL[5], 'Флагман');

  for (let i = 0; i < 40; i++) {
    const board = E.randomBoard(E.FLEETS.admiral);
    assert.equal(E.totalShips(board), 11);
    assert.deepEqual(sortedSizes(board), [5, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1]);
    for (let s = 0; s < board.ships.length; s++) {
      for (let k = s + 1; k < board.ships.length; k++) {
        assert.ok(shipsDoNotTouch(board.ships[s], board.ships[k]));
      }
    }
  }
});

test('случайная расстановка всегда валидна: 10 кораблей, без касаний', () => {
  for (let i = 0; i < 120; i++) {
    const board = E.randomBoard();
    assert.equal(E.totalShips(board), 10);
    assert.deepEqual(sortedSizes(board), [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]);

    for (let s = 0; s < board.ships.length; s++) {
      for (let k = s + 1; k < board.ships.length; k++) {
        assert.ok(
          shipsDoNotTouch(board.ships[s], board.ships[k]),
          `корабли ${s} и ${k} касаются друг друга`
        );
      }
    }

    for (const ship of board.ships) {
      assert.ok(ship.cells.every((c) => c.x >= 0 && c.x < 10 && c.y >= 0 && c.y < 10));
    }
  }
});

test('правила установки: границы, пересечения и касания', () => {
  const board = E.createBoard();
  const ship = E.placeShip(board, 0, 0, 4, true);
  assert.equal(ship.cells.length, 4);

  assert.equal(E.canPlace(board, 0, 1, 1, true), false, 'нельзя вплотную под кораблём');
  assert.equal(E.canPlace(board, 4, 1, 1, true), false, 'нельзя по диагонали');
  assert.equal(E.canPlace(board, 2, 0, 1, true), false, 'нельзя поверх корабля');
  assert.equal(E.canPlace(board, 4, 2, 1, true), true, 'в двух клетках — можно');
  assert.equal(E.canPlace(board, 9, 0, 2, true), false, 'нельзя за границей поля');
  assert.equal(E.canPlace(board, 0, 9, 2, false), false, 'вертикально за границей');

  const removed = E.removeShipAt(board, 0, 0);
  assert.equal(removed.size, 4);
  assert.equal(board.ships.length, 0);
  assert.equal(board.grid[0][0], -1);
});

test('выстрелы: промах, попадание, потопление и повторный выстрел', () => {
  const board = E.createBoard();
  E.placeShip(board, 0, 0, 3, true);

  assert.equal(E.fire(board, 9, 9).result, 'miss');
  assert.equal(E.fire(board, 9, 9), null, 'в одну клетку дважды нельзя');

  assert.equal(E.fire(board, 0, 0).result, 'hit');
  assert.equal(E.fire(board, 1, 0).result, 'hit');
  assert.equal(E.allSunk(board), false);

  const last = E.fire(board, 2, 0);
  assert.equal(last.result, 'sunk');
  assert.equal(last.ship.sunk, true);
  assert.equal(E.allSunk(board), true);
});

test('потопление однопалубного корабля', () => {
  const board = E.createBoard();
  const ship = E.placeShip(board, 5, 5, 1, true);
  const shot = E.fire(board, 5, 5);
  assert.equal(shot.result, 'sunk');
  assert.equal(shot.ship, ship);
  assert.equal(E.allSunk(board), true);
  assert.equal(E.shipsLeft(board), 0);
});

test('бот добивает флот и не стреляет в одну клетку дважды', () => {
  for (let game = 0; game < 25; game++) {
    const board = E.randomBoard();
    const bot = new E.Bot();
    const seen = new Set();
    let moves = 0;

    while (!E.allSunk(board) && moves < 120) {
      const move = bot.choose();
      assert.ok(move, 'бот должен находить клетку');
      const key = move.x + ',' + move.y;
      assert.ok(!seen.has(key), 'бот не должен повторять выстрел');
      seen.add(key);

      const shot = E.fire(board, move.x, move.y);
      assert.ok(shot, 'выстрел должен быть валидным');
      bot.report(move.x, move.y, shot);
      moves++;
    }

    assert.equal(E.allSunk(board), true);
    assert.ok(moves <= 100, `боту потребовалось ${moves} выстрелов`);
  }
});

test('уровни бота: лёгкий не добивает, сложный целится по плотности', () => {
  const board = E.randomBoard();
  const easy = new E.Bot('easy');
  const normal = new E.Bot('normal');
  const hard = new E.Bot('hard');

  // «лёгкий» после попадания не ставит соседние клетки в очередь
  const hit = E.fire(board, board.ships[0].cells[0].x, board.ships[0].cells[0].y);
  easy.report(board.ships[0].cells[0].x, board.ships[0].cells[0].y, hit);
  normal.report(board.ships[0].cells[0].x, board.ships[0].cells[0].y, hit);
  assert.equal(easy.queue.length, 0, 'лёгкий бот не должен добивать');
  assert.ok(normal.queue.length > 0, 'обычный бот добивает');

  // «сложный» на свежем поле выбирает клетку с максимальной плотностью
  const fresh = E.createBoard();
  fresh.ships = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1].map((size, i) => ({ id: i, size, sunk: false, cells: [] }));
  const pick = hard.choose(fresh);
  assert.ok(pick, 'сложный бот должен найти клетку');
  let best = -1;
  for (let y = 0; y < E.SIZE; y++) {
    for (let x = 0; x < E.SIZE; x++) best = Math.max(best, hard.density(x, y, [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]));
  }
  assert.equal(hard.density(pick.x, pick.y, [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]), best);
});

test('все уровни бота добивают флот без повторных выстрелов', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    for (let game = 0; game < 6; game++) {
      const board = E.randomBoard();
      const bot = new E.Bot(level);
      const seen = new Set();
      let moves = 0;
      while (!E.allSunk(board) && moves < 130) {
        const move = bot.choose(board);
        assert.ok(move, level + ': бот должен находить клетку');
        const key = move.x + ',' + move.y;
        assert.ok(!seen.has(key), level + ': повтор выстрела');
        seen.add(key);
        const shot = E.fire(board, move.x, move.y);
        assert.ok(shot, level + ': выстрел должен быть валидным');
        bot.report(move.x, move.y, shot);
        moves++;
      }
      assert.equal(E.allSunk(board), true, level + ': флот не добит');
    }
  }
});

test('ELO: равные рейтинги, андердог и фаворит', () => {
  assert.equal(E.eloExpected(1000, 1000), 0.5);
  assert.equal(E.eloDelta(1000, 1000, 1), 16);
  assert.equal(E.eloDelta(1000, 1000, 0), -16);

  assert.ok(E.eloDelta(900, 1200, 1) > 16, 'андердог получает больше за победу');
  assert.ok(E.eloDelta(1200, 900, 1) < 16, 'фаворит получает меньше');
  assert.ok(E.eloDelta(1200, 900, 0) < -16, 'фаворит теряет больше за поражение');
});

test('ранги и границы', () => {
  assert.equal(E.rankFor(0).name, 'Юнга');
  assert.equal(E.rankFor(1000).name, 'Матрос');
  assert.equal(E.rankFor(1499).name, 'Штурман');
  assert.equal(E.rankFor(1500).name, 'Капитан');
  assert.equal(E.rankFor(2500).name, 'Легенда');
  assert.equal(E.nextRank(1000).name, 'Боцман');
  assert.equal(E.nextRank(2500), null);
});

test('случайные ники — из списка', () => {
  for (let i = 0; i < 50; i++) {
    assert.ok(E.NAMES.includes(E.randomName()));
  }
});

test('shipAt: корабль, пустая клетка и выход за поле', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 2, 3, 3, true);
  assert.equal(E.shipAt(b, 4, 3), s);
  assert.equal(E.shipAt(b, 2, 4), null);
  assert.equal(E.shipAt(b, -1, 0), null);
  assert.equal(E.shipAt(b, 10, 0), null);
});

test('canPlaceCells: свои клетки игнорируются, чужие и границы — нет', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 0, 0, 4, true);
  assert.equal(E.canPlaceCells(b, s.cells, s.id), true);
  assert.equal(E.canPlaceCells(b, s.cells), false);

  const block = E.placeShip(b, 5, 5, 1, true);
  assert.equal(E.canPlaceCells(b, block.cells, block.id), true);
  assert.equal(E.canPlaceCells(b, [{ x: 9, y: 9 }, { x: 10, y: 9 }], -1), false);
  assert.equal(E.canPlaceCells(b, [{ x: 0, y: 1 }], -1), false);
});

test('rotateShip: два нажатия возвращают корабль на место', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 3, 4, 4, true);
  const before = Array.from(s.cells, (c) => [c.x, c.y]);

  const first = E.rotateShip(b, s.id, 'right');
  assert.equal(first.ok, true);
  assert.deepEqual(
    Array.from(s.cells, (c) => [c.x, c.y]),
    [[3, 4], [3, 5], [3, 6], [3, 7]]
  );
  assert.equal(s.horizontal, false);

  const second = E.rotateShip(b, s.id, 'right');
  assert.equal(second.ok, true);
  assert.deepEqual(Array.from(s.cells, (c) => [c.x, c.y]), before);
  assert.equal(s.horizontal, true);
});

test('rotateShip: влево и вправо дают один силуэт, но разный нос', () => {
  const right = E.createBoard();
  const sr = E.placeShip(right, 2, 2, 4, true);
  E.rotateShip(right, sr.id, 'right');

  const left = E.createBoard();
  const sl = E.placeShip(left, 2, 2, 4, true);
  E.rotateShip(left, sl.id, 'left');

  const cells = (ship) => Array.from(ship.cells, (c) => c.x + ':' + c.y).sort();
  assert.deepEqual(cells(sr), cells(sl));
  assert.equal(sr.cells[0].y, 2);
  assert.equal(sl.cells[0].y, 5);
});

test('rotateShip: у нижнего края корабль сдвигается внутрь поля', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 1, 7, 4, true);
  const r = E.rotateShip(b, s.id, 'right');
  assert.equal(r.ok, true);
  assert.equal(s.cells[0].y, 6);
  for (const c of s.cells) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x < E.SIZE && c.y < E.SIZE);
  }
});

test('rotateShip: чужой корабль рядом и касание углом отклоняются', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 0, 0, 4, true);
  E.placeShip(b, 1, 2, 1, true);
  const before = Array.from(s.cells, (c) => [c.x, c.y]);

  const r = E.rotateShip(b, s.id, 'right');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'collision');
  assert.deepEqual(Array.from(s.cells, (c) => [c.x, c.y]), before);
  assert.equal(b.grid[0][0], s.id);

  const corner = E.createBoard();
  const sc = E.placeShip(corner, 0, 0, 4, true);
  E.placeShip(corner, 1, 3, 1, true);
  assert.equal(E.rotateShip(corner, sc.id, 'right').ok, false);
});

test('rotateShip: корабль длиной 1 не меняется', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 5, 5, 1, true);
  const r = E.rotateShip(b, s.id, 'left');
  assert.equal(r.ok, true);
  assert.deepEqual(Array.from(s.cells, (c) => [c.x, c.y]), [[5, 5]]);
});

test('rotateShip: у правого края корабль сдвигается внутрь поля', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 9, 0, 4, false);
  const r = E.rotateShip(b, s.id, 'right');
  assert.equal(r.ok, true);
  assert.equal(s.horizontal, true);
  assert.deepEqual(Array.from(s.cells, (c) => c.x).sort((a, c) => a - c), [6, 7, 8, 9]);
  for (const c of s.cells) {
    assert.ok(c.x >= 0 && c.x < E.SIZE && c.y >= 0 && c.y < E.SIZE);
  }
});

test('rotateShip: hits и sunk сохраняются', () => {
  const b = E.createBoard();
  const s = E.placeShip(b, 0, 0, 2, true);
  s.hits = 1;
  s.sunk = true;
  E.rotateShip(b, s.id, 'right');
  assert.equal(s.hits, 1);
  assert.equal(s.sunk, true);
});
